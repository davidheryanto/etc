// Stepped GPU soak test: VRAM pattern check, load steps, real power-state cycles, idle, VRAM again.
// See nvidia.md -> "Health check after installing or reseating a card".
//
//   nvcc -O2 -o nvidia-soak nvidia-soak.cu -lnvidia-ml
//   ./nvidia-soak            # full run, about 18 minutes
//   ./nvidia-soak 100 180    # one step only: 100% load for 180 s (e.g. to compare power limits)
//
// Tests the first visible GPU; pick another with CUDA_VISIBLE_DEVICES=<index>.
// ITERS=<n> fixes the kernel size (printed at start) so separate runs do the same work per kernel.
//
// Load runs on two copies of the same data; a mismatch between them means the GPU computed wrong.
// Exit codes: 0 pass, 1 bad arguments, 2 CUDA error, 3 VRAM pattern mismatch, 4 compute mismatch.
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cmath>
#include <chrono>
#include <thread>
#include <cuda_runtime.h>
#include <nvml.h>

using clk = std::chrono::steady_clock;
static const clk::time_point t0 = clk::now();
static double now() { return std::chrono::duration<double>(clk::now() - t0).count(); }
static void sleep_s(double s) { if (s > 0) std::this_thread::sleep_for(std::chrono::duration<double>(s)); }

#define CK(x) do { cudaError_t ce_ = (x); if (ce_) { \
    printf("[%5.0fs] CUDA ERROR %s at %s\n", now(), cudaGetErrorString(ce_), #x); fflush(stdout); exit(2); } } while (0)

// Bounded FMA chain: keeps the SMs busy without touching memory, values stay finite.
// Thread i and thread i+n compute the same thing, on different SMs. The FMA chain settles to a fixed
// point, which would damp a one-off error away, so each step's bits also go into a running hash h:
// a wrong value anywhere changes h for good.
__global__ void burn(float *a, uint32_t *h, int n2, int it) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n2) return;
    float x = a[i], y = 1.0f - x;
    uint32_t g = h[i];
    for (int j = 0; j < it; j++) {
        x = fmaf(x, 0.9999f, y * 1e-4f); y = fmaf(y, 0.9998f, x * 2e-4f);
        g = (g ^ __float_as_uint(x)) * 16777619u;
    }
    a[i] = x; h[i] = g;
}
__global__ void compare(const uint32_t *h, int n, unsigned long long *bad) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n && h[i] != h[i + n]) atomicAdd(bad, 1ull);
}
__global__ void seed(float *a, uint32_t *h, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) { a[i] = a[i + n] = (i % 1000) * 0.001f; h[i] = h[i + n] = 2166136261u ^ i; }
}

// mode 0: fixed pattern; mode 1: address-dependent pattern (catches address-line faults).
__device__ uint32_t want(size_t i, uint32_t pat, int mode) { return mode ? (uint32_t)(i * 2654435761u) ^ pat : pat; }
__global__ void wr(uint32_t *p, size_t n, uint32_t pat, int mode) {
    size_t s = gridDim.x * (size_t)blockDim.x;
    for (size_t i = blockIdx.x * (size_t)blockDim.x + threadIdx.x; i < n; i += s) p[i] = want(i, pat, mode);
}
__global__ void rd(const uint32_t *p, size_t n, uint32_t pat, int mode, unsigned long long *bad) {
    size_t s = gridDim.x * (size_t)blockDim.x;
    unsigned long long b = 0;
    for (size_t i = blockIdx.x * (size_t)blockDim.x + threadIdx.x; i < n; i += s) if (p[i] != want(i, pat, mode)) b++;
    if (b) atomicAdd(bad, b);
}

static unsigned long long *bad;  // managed counter

// Basic pattern check over most free VRAM (keeps 1 GiB back for the driver).
static void vram(const char *tag) {
    size_t fr, tot;
    CK(cudaMemGetInfo(&fr, &tot));
    size_t bytes = fr > (2ull << 30) ? fr - (1ull << 30) : fr / 2;
    uint32_t *p;
    CK(cudaMalloc(&p, bytes));
    size_t n = bytes / 4;
    const uint32_t pats[] = {0x00000000, 0xFFFFFFFF, 0xAAAAAAAA, 0x55555555, 0xDEADBEEF};
    unsigned long long total = 0; int runs = 0;
    for (int mode = 0; mode < 2; mode++)
        for (int k = 0; k < (mode ? 2 : 5); k++, runs++) {
            *bad = 0;
            wr<<<2048, 256>>>(p, n, pats[k], mode);
            rd<<<2048, 256>>>(p, n, pats[k], mode, bad);
            CK(cudaDeviceSynchronize());
            total += *bad;
        }
    printf("[%5.0fs] VRAM %s: %.1f of %.1f GiB x %d patterns, %llu bad words\n",
           now(), tag, bytes / 1073741824.0, tot / 1073741824.0, runs, total);
    fflush(stdout);
    CK(cudaFree(p));
    if (total) exit(3);
}

static float *d; static uint32_t *hs; static int n, it;
static void kernel() { burn<<<(2 * n + 255) / 256, 256>>>(d, hs, 2 * n, it); CK(cudaDeviceSynchronize()); }
static void check(const char *tag) {
    *bad = 0;
    compare<<<(n + 255) / 256, 256>>>(hs, n, bad);
    CK(cudaDeviceSynchronize());
    if (*bad) { printf("[%5.0fs] COMPUTE MISMATCH after %s: %llu values differ\n", now(), tag, *bad); fflush(stdout); exit(4); }
}

static nvmlDevice_t nv; static bool have_nvml;
static int pstate() {
    nvmlPstates_t p;
    return have_nvml && nvmlDeviceGetPerformanceState(nv, &p) == NVML_SUCCESS ? (int)p : -1;
}

// Load for `frac` of each `period` seconds, for `secs` seconds. Returns kernels run.
static long duty(double frac, int secs, double period) {
    double end = now() + secs; long k = 0;
    while (now() < end) {
        double w0 = now();
        while (now() - w0 < frac * period) { kernel(); k++; }
        sleep_s(period - (now() - w0));
    }
    return k;
}

// Full load for `on` seconds, then rest until the GPU reaches its deepest idle P-state (P8; it passes P5 first),
// up to `maxwait` seconds. Without NVML it just rests `maxwait`.
static void pcycles(int cycles, int on, int maxwait) {
    int reached = 0; double waited = 0;
    for (int c = 0; c < cycles; c++) {
        duty(1.0, on, 0.2);
        double w0 = now();
        while (now() - w0 < maxwait) { sleep_s(1); if (pstate() >= 8) { reached++; sleep_s(5); break; } }  // hold P8 5 s before the next burst
        waited += now() - w0;
        check("power-state cycle");
    }
    if (have_nvml) printf("[%5.0fs]   reached P8 in %d of %d cycles (avg %.0f s to drop)\n",
                          now(), reached, cycles, waited / cycles);
    else printf("[%5.0fs]   (no NVML: rested %d s per cycle, P-state not verified)\n", now(), maxwait);
    fflush(stdout);
}

int main(int argc, char **argv) {
    double step_pct = 0; int step_secs = 0;
    if (argc == 3) {
        char *e1, *e2;
        step_pct = strtod(argv[1], &e1); step_secs = (int)strtol(argv[2], &e2, 10);
        if (*e1 || *e2 || !std::isfinite(step_pct) || step_pct <= 0 || step_pct > 100 || step_secs <= 0) {
            fprintf(stderr, "usage: %s [<load %% 1-100> <seconds>]\n", argv[0]); return 1;
        }
    } else if (argc != 1) { fprintf(stderr, "usage: %s [<load %% 1-100> <seconds>]\n", argv[0]); return 1; }

    // Identify the GPU under test.
    cudaDeviceProp prop; CK(cudaGetDeviceProperties(&prop, 0));
    char bus[32]; CK(cudaDeviceGetPCIBusId(bus, sizeof bus, 0));
    have_nvml = nvmlInit_v2() == NVML_SUCCESS && nvmlDeviceGetHandleByPciBusId_v2(bus, &nv) == NVML_SUCCESS;
    printf("GPU: %s at %s%s\n", prop.name, bus, have_nvml ? "" : " (NVML unavailable: P-states not checked)");

    CK(cudaMallocManaged(&bad, sizeof *bad));
    n = 1 << 25;  // two copies of 32 Mi values: 256 MiB of floats, 256 MiB of hashes
    CK(cudaMalloc(&d, 2ull * n * sizeof(float)));
    CK(cudaMalloc(&hs, 2ull * n * sizeof(uint32_t)));
    seed<<<(n + 255) / 256, 256>>>(d, hs, n);
    CK(cudaDeviceSynchronize());

    // Kernel size: ITERS, or calibrate to ~10 ms per kernel after a warm-up, timed on the GPU.
    const char *env = getenv("ITERS");
    cudaEvent_t s, e; CK(cudaEventCreate(&s)); CK(cudaEventCreate(&e));
    it = 64; kernel();  // warm-up
    if (env) it = atoi(env);
    for (;;) {
        float ms;
        CK(cudaEventRecord(s)); burn<<<(2 * n + 255) / 256, 256>>>(d, hs, 2 * n, it); CK(cudaEventRecord(e));
        CK(cudaEventSynchronize(e)); CK(cudaEventElapsedTime(&ms, s, e));
        if (env || ms > 8 || it > (1 << 24)) { printf("kernel: ITERS=%d, %.1f ms each\n", it, ms); break; }
        it *= 2;
    }
    fflush(stdout);

    if (step_secs) {
        printf("[%5.0fs] step %.0f%% for %d s\n", now(), step_pct, step_secs); fflush(stdout);
        long k = duty(step_pct / 100, step_secs, 0.2);
        check("step");
        printf("[%5.0fs]   done, %ld kernels (%.2f/s), results match\nSTEP PASSED (load only, no VRAM test)\n",
               now(), k, k / (double)step_secs);
        return 0;
    }

    vram("start");
    struct { const char *name; double frac; int secs; } steps[] = {{"100%", 1.0, 240}, {"80%", 0.8, 120}, {"50%", 0.5, 120}, {"20%", 0.2, 90}};
    for (auto &p : steps) {
        printf("[%5.0fs] phase %s for %d s\n", now(), p.name, p.secs); fflush(stdout);
        long k = duty(p.frac, p.secs, 0.2);
        check(p.name);
        printf("[%5.0fs]   done, %ld kernels (%.2f/s), results match\n", now(), k, k / (double)p.secs); fflush(stdout);
    }
    // Short on/off bursts: the card stays in its high P-state through these.
    printf("[%5.0fs] phase load cycling, 0.5 s on / 0.5 s off for 120 s\n", now()); fflush(stdout);
    duty(0.5, 120, 1.0);
    check("load cycling");
    // Real power-state transitions: load, then rest until the card drops to idle (it waits ~a minute).
    printf("[%5.0fs] phase power-state cycles: 10 s load, then rest until P8 (deepest idle), x5\n", now()); fflush(stdout);
    pcycles(5, 10, 180);
    printf("[%5.0fs] phase idle for 180 s\n", now()); fflush(stdout);
    sleep_s(180);
    printf("[%5.0fs]   done, P-state now P%d\n", now(), pstate());
    check("idle");
    vram("end");
    printf("SOAK PASSED\n");
    return 0;
}
