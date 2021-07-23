#!/usr/bin/env python
import signal
import subprocess
import sys
import time

# Make sure fan control is already enabled in the driver. Run this command to enable that.
# sudo nvidia-xconfig --cool-bits=4

# FAN_CURVES is a list of tuple (temperature in celcius, fan speed percentage), must be from lower to higher temperature
FAN_CURVES = [
    (35, 30),
    (45, 40),
    (60, 70),
    (75, 85),
    (80, 90),
    (85, 99),
]

# Check the current temperature against the fan curve every X seconds
CHECK_FREQUENCY = 10


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
    # Ensure returned temperature is between 1-99 degree celcius.
    temperature = min(temperature, 99)
    temperature = max(temperature, 1)
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


def calculate_desired_fan_percentage(current_temperature: int, fan_curves: list) -> int:
    """
    >>> fan_curves_testcase = [(35, 30),(45, 40),(60, 70),(75, 85),(80, 90),(85, 99)]
    >>> calculate_desired_fan_percentage(10, fan_curves_testcase)
    30
    >>> calculate_desired_fan_percentage(35, fan_curves_testcase)
    30
    >>> calculate_desired_fan_percentage(37, fan_curves_testcase)
    32
    >>> calculate_desired_fan_percentage(70, fan_curves_testcase)
    80
    >>> calculate_desired_fan_percentage(83, fan_curves_testcase)
    95
    >>> calculate_desired_fan_percentage(88, fan_curves_testcase)
    99
    """
    upper_temperature, upper_fan_percentage = 100, 99
    for lower_temperature, lower_fan_percentage in reversed(fan_curves):

        if current_temperature > lower_temperature:
            # Found the first item in fan curves, where the temperature is just lower than current temperature.
            # Calculate additional fan percentage to be added to the lower fan percentage.
            temperature_range = upper_temperature - lower_temperature
            fan_percentage_range = upper_fan_percentage - lower_fan_percentage
            delta_fan_percentage = (current_temperature - lower_temperature) / temperature_range * fan_percentage_range
            desired_fan_percentage = lower_fan_percentage + delta_fan_percentage
            return int(desired_fan_percentage)

        upper_temperature = lower_temperature
        upper_fan_percentage = lower_fan_percentage

    # If we reach this point, current temperature must be quite low, lower than lowest set in the fan curve.
    # Return the lowest fan percentage in the fan curve
    return int(fan_curves[0][1])


def main():
    signal.signal(signal.SIGINT, reset_fan_to_auto_and_exit)
    signal.signal(signal.SIGTERM, reset_fan_to_auto_and_exit)

    while True:
        current_temperature = get_temperature()
        desired_fan_percentage = calculate_desired_fan_percentage(current_temperature, FAN_CURVES)
        set_fan_speed(desired_fan_percentage)
        time.sleep(CHECK_FREQUENCY)


if __name__ == "__main__":
    main()
