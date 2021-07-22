#!/usr/bin/env python
import signal
import subprocess
import sys
import time

# Make sure fan control is already enabled in the driver. Run this command to enable that.
# sudo nvidia-xconfig --cool-bits=4

# fan_curves is a list of tuple (temperature in celcius, fan speed percentage)
fan_curves = [
    (35, 30),
    (45, 40),
    (60, 70),
    (75, 85),
    (80, 90),
    (85, 99),
]
# Check the current temperature against the fan curve every X seconds
check_frequency = 10


def run_command(command: str) -> str:
    completed_process = subprocess.run(
        command,
        shell=True,
        capture_output=True,
    )
    if completed_process.returncode != 0:
        raise Exception(f"Failed to run command: {command}. Exit code: {completed_process.returncode}. Error message: {completed_process.stderr}")
    return completed_process.stdout.decode("utf-8").strip()


def get_temperature() -> int:
    stdout = run_command("nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader")
    temperature = int(stdout)
    return temperature


def set_fan_speed(percentage: int, fan_count: int = 2):
    run_command("nvidia-settings -a [gpu:0]/GPUFanControlState=1")
    # Fan speed should not exceed 99 %
    percentage = int(min(percentage, 99))
    for index in range(fan_count):
        run_command(f"nvidia-settings -a [fan:{index}]/GPUTargetFanSpeed={percentage}")


def reset_fan_to_auto_and_exit(*args, **kwargs):
    run_command("nvidia-settings -a [gpu:0]/GPUFanControlState=0")
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, reset_fan_to_auto_and_exit)
    signal.signal(signal.SIGTERM, reset_fan_to_auto_and_exit)

    while True:
        current_temperature = get_temperature()
        for i, (temperature_lower_bound, fan_percentage_lower_bound) in enumerate(fan_curves):
            if current_temperature > temperature_lower_bound:
                if i != len(fan_curves) - 1:
                    # If we have the next upper limit in fan curve, extrapolate between lower and upper bound to get the desired fan percentage.
                    temperature_upper_bound, fan_percentage_upper_bound = fan_curves[i + 1]

                    # Calculate how much additional fan percentage from the current lower bound
                    delta_temperature_bound = temperature_upper_bound - temperature_lower_bound
                    delta_fan_percentage_bound = fan_percentage_upper_bound - fan_percentage_lower_bound
                    delta_fan_percentage = (current_temperature - temperature_lower_bound) / delta_temperature_bound * delta_fan_percentage_bound

                    desired_fan_percentage = temperature_lower_bound + delta_fan_percentage
                else:
                    # We have no higher upper bound, set the fan percentage to the one at this bound
                    desired_fan_percentage = fan_percentage_lower_bound
                set_fan_speed(desired_fan_percentage)
                break
        time.sleep(check_frequency)


if __name__ == "__main__":
    main()
