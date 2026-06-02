"""Sample TelData script — STUB VERSION (pywin32 removed).

This is a stub implementation that demonstrates the API without requiring
pywin32 or TelDataX4. It generates dummy data instead.
"""

import numpy as np
from scipy.io import savemat
from scipy.interpolate import interp1d
import re
import os


# ---------------------------------------------------------------------------
# Archive opening (STUB)
# ---------------------------------------------------------------------------

def open_archive(archivePath):
    """Stub: Return a dummy archive object."""
    print(f"Stub: Opening archive: {archivePath}")
    return {"path": archivePath, "status": "dummy"}


# ---------------------------------------------------------------------------
# Run helpers (STUB)
# ---------------------------------------------------------------------------

def _get_run_label(run):
    """Stub: Return a dummy run label."""
    return "(stub run)"


def _collect_runs(run, flat_list, level=0):
    """Stub: Collect dummy runs."""
    if level == 0:
        flat_list.append((0, "Run 1 (stub)", run, level))
        flat_list.append((1, "Run 2 (stub)", run, level))


def select_run(mainOBJ):
    """Stub: Select a dummy run."""
    flat_list = []
    _collect_runs(mainOBJ, flat_list)

    if not flat_list:
        print('No child runs found in this archive.')
        return None

    print('\n=== Available Runs (STUB DATA) ===')
    for idx, label, _obj, level in flat_list:
        indent = '  ' * level
        print(f'  [{idx:>3}] {indent}{label}')

    while True:
        choice = input(f'\nSelect run ID [0-{len(flat_list)-1}]: ').strip()
        try:
            i = int(choice)
            if 0 <= i < len(flat_list):
                return flat_list[i][2]
        except ValueError:
            pass
        print(f'  Please enter a number between 0 and {len(flat_list)-1}.')


# ---------------------------------------------------------------------------
# Lap helpers (STUB)
# ---------------------------------------------------------------------------

def _get_lap_label(lap):
    """Stub: Return a dummy lap label."""
    return "Lap (stub)"


def select_lap(run):
    """Stub: Select a dummy lap."""
    lapCount = 3  # Return 3 dummy laps
    if lapCount == 0:
        print('No laps found in this run.')
        return None

    print('\n=== Available Laps (STUB DATA) ===')
    for l in range(lapCount):
        print(f'  [{l:>3}] Lap {l} (stub) 00:02:05.123')

    while True:
        choice = input(f'\nSelect lap ID [0-{lapCount-1}]: ').strip()
        try:
            i = int(choice)
            if 0 <= i < lapCount:
                return {"lap_id": i}
        except ValueError:
            pass
        print(f'  Please enter a number between 0 and {lapCount-1}.')


# ---------------------------------------------------------------------------
# Channel helpers (STUB)
# ---------------------------------------------------------------------------

def list_channels(lap):
    """Stub: Return list of dummy channels."""
    dummy_channels = [
        (0, "Speed", 100, 12000),
        (1, "Throttle", 100, 12000),
        (2, "Brake", 100, 12000),
        (3, "Steering", 100, 12000),
        (4, "RPM", 100, 12000),
        (5, "Gear", 100, 12000),
        (6, "Lap Distance", 100, 12000),
    ]
    return dummy_channels


def select_channels(lap):
    """Stub: Select dummy channels."""
    channels = list_channels(lap)
    if not channels:
        print('No channels found in this lap.')
        return []

    print('\n=== Available Channels (STUB DATA) ===')
    for idx, name, rate, count in channels:
        print(f'  [{idx:>4}] {name:<40} {rate:>6} Hz   {count:>8} samples')

    print('\nEnter channel names to export (comma-separated), or "all" for all channels:')
    choice = input('> ').strip()

    if choice.lower() == 'all':
        return channels

    requested = [n.strip() for n in choice.split(',') if n.strip()]
    name_map = {info[1].lower(): info for info in channels}

    selected = []
    not_found = []
    for req in requested:
        if req.lower() in name_map:
            selected.append(name_map[req.lower()])
        else:
            not_found.append(req)

    if not_found:
        print(f'  Warning – channels not found: {", ".join(not_found)}')
    if not selected:
        print('  No valid channels selected.')
    return selected


# ---------------------------------------------------------------------------
# Reading & resampling (STUB)
# ---------------------------------------------------------------------------

def read_channel(chan_obj, sample_count, sample_rate):
    """Stub: Generate dummy channel data."""
    # Generate synthetic signal
    values = 50.0 + 20.0 * np.sin(2 * np.pi * 0.1 * np.arange(sample_count) / sample_rate)
    values += np.random.normal(0, 2, sample_count)
    t = np.arange(len(values)) / sample_rate
    return t, values


def resample_to_common_time(channel_data, target_freq):
    """
    Interpolate all channels to a shared uniform time vector.

    channel_data : list of (name, t_orig, values)
    target_freq  : Hz (float)
    Returns (t_common, {name: resampled_array})
    """
    max_duration = max(t[-1] for _, t, v in channel_data if len(t) > 0)
    n_samples = int(np.ceil(max_duration * target_freq)) + 1
    t_common = np.linspace(0.0, max_duration, n_samples)

    resampled = {}
    for name, t_orig, values in channel_data:
        if len(t_orig) > 1:
            f = interp1d(t_orig, values, kind='linear',
                         bounds_error=False,
                         fill_value=(values[0], values[-1]))
            resampled[name] = f(t_common)
        else:
            resampled[name] = np.full(len(t_common),
                                      values[0] if len(values) > 0 else 0.0)
    return t_common, resampled


def name_to_matlab_var(name):
    """Convert an arbitrary string to a valid MATLAB variable name."""
    safe = re.sub(r'[^A-Za-z0-9_]', '_', name)
    if safe and safe[0].isdigit():
        safe = 'ch_' + safe
    return safe[:63]  # MATLAB limit


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_to_mat(channels, target_freq, output_path):
    """Stub: Export dummy channels to .mat file."""
    print(f'\nReading {len(channels)} channel(s) (stub data)...')
    channel_data = []
    for idx, name, rate, count in channels:
        t, values = read_channel(None, count, rate)
        channel_data.append((name, t, values))
        print(f'  {name}: {count} samples @ {rate} Hz')

    print(f'\nResampling to {target_freq} Hz...')
    t_common, resampled = resample_to_common_time(channel_data, target_freq)

    mat_data = {
        'time': t_common,
        'frequency_hz': np.array([target_freq]),
    }
    name_collisions = {}
    for name, arr in resampled.items():
        var = name_to_matlab_var(name)
        if var in name_collisions:
            name_collisions[var] += 1
            var = f'{var}_{name_collisions[var]}'
        else:
            name_collisions[var] = 0
        mat_data[var] = arr
        print(f'  {name} -> {var} ({len(arr)} samples)')

    savemat(output_path, mat_data)
    print(f'\nExported {len(resampled)} channel(s) + time vector to: {output_path}')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def Main():
    default_path = r'\\vzaq04\WEC\DAT__DATA\DAT010_Course\2026\26S16\26S16_R02_Imola\12_Race\9X8-C309-93'
    raw = input(f'Archive path [{default_path}]: ').strip()
    archivePath = raw if raw else default_path

    mainOBJ = open_archive(archivePath)
    if mainOBJ is None:
        return

    run = select_run(mainOBJ)
    if run is None:
        return

    lap = select_lap(run)
    if lap is None:
        return

    channels = select_channels(lap)
    if not channels:
        return

    max_freq = max(ch[2] for ch in channels)
    raw_freq = input(f'\nTarget frequency in Hz [default: {max_freq}]: ').strip()
    try:
        target_freq = float(raw_freq) if raw_freq else float(max_freq)
    except ValueError:
        print(f'Invalid frequency – using {max_freq} Hz.')
        target_freq = float(max_freq)

    raw_out = input('Output .mat file path [default: output.mat]: ').strip()
    output_path = raw_out if raw_out else 'output.mat'
    if not output_path.endswith('.mat'):
        output_path += '.mat'

    export_to_mat(channels, target_freq, output_path)


if __name__ == '__main__':
    Main()
