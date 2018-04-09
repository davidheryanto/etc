package main

// References:
// ============
// https://godoc.org/github.com/docker/docker/client
// https://docs.docker.com/develop/sdk/examples/

import (
    "github.com/docker/docker/client"
    "github.com/docker/docker/api/types"
    "github.com/docker/docker/api/types/container"
    "golang.org/x/net/context"
    "io"
    "os"
    "log"
)

func main() {
    ctx := context.Background()
    cli, err := client.NewEnvClient()
    if err != nil {
        panic(err)
    }

    _, err = cli.ImagePull(ctx, "continuumio/anaconda3", types.ImagePullOptions{})
    if err != nil {
        panic(err)
    }

    resp, err := cli.ContainerCreate(ctx, &container.Config{
        Image: "debian",
        // This example is to simulate container that fails hence it will try to execute non-existent command: weirdcommand
        Cmd: []string{"bash", "-c", "for i in {1..3}; do echo Hello $i; sleep 1; done; weirdcommand"},
    }, nil, nil, "")
    if err != nil {
        panic(err)
    }

    if err := cli.ContainerStart(ctx, resp.ID, types.ContainerStartOptions{}); err != nil {
        panic(err)
    }

    out, err := cli.ContainerLogs(ctx, resp.ID,
        types.ContainerLogsOptions{ShowStdout: true, ShowStderr: true, Follow: true})
    if err != nil {
        panic(err)
    }

    io.Copy(os.Stdout, out)

    statusCh, errCh := cli.ContainerWait(ctx, resp.ID, container.WaitConditionNotRunning)
    select {
    case err := <-errCh:
        if err != nil {
            panic(err)
        }
    case status := <-statusCh:
        if status.StatusCode != 0 {
            log.Fatalf("Docker container exits with status %d", status.StatusCode)
        }
    }
}
