import win32com.client
import pythoncom
import numpy as np
from scipy.io import savemat
from scipy.interpolate import interp1d
import re
import os


# ---------------------------------------------------------------------------
# Archive opening
# ---------------------------------------------------------------------------

def open_archive(archivePath):
    mainOBJ = win32com.client.Dispatch('TelDataX4.TelRun3')
    result = mainOBJ.Open2(archivePath, 0)
    if result != 0:
        print(f'Cannot open archive (error {result}): {archivePath}')
        return None
    return mainOBJ


# ---------------------------------------------------------------------------
# Run helpers
# ---------------------------------------------------------------------------

def _get_run_label(run):
    """Return a human-readable label for a run using its local properties."""
    localProp = 1
    propCount = run.GetPropertyCount(localProp)
    for p in range(propCount):
        name = run.GetPropertyName(p)
        if re.search(r'name|description|label|title', name, re.IGNORECASE):
            val = run.GetPropertyData(p)
            if val:
                return str(val)
    return '(no name)'


def _collect_runs(run, flat_list, level=0):
    """Recursively collect all child runs into flat_list as (idx, label, obj)."""
    runCount = run.GetRunCount()
    for r in range(runCount):
        child = run.GetRun(r)
        child = win32com.client.Dispatch(child.QueryInterface(pythoncom.IID_IDispatch))
        label = _get_run_label(child)
        idx = len(flat_list)
        flat_list.append((idx, label, child, level))
        _collect_runs(child, flat_list, level + 1)


def select_run(mainOBJ):
    flat_list = []
    _collect_runs(mainOBJ, flat_list)

    if not flat_list:
        print('No child runs found in this archive.')
        return None

    print('\n=== Available Runs ===')
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
# Lap helpers
# ---------------------------------------------------------------------------

def _get_lap_label(lap):
    localProp = 1
    parts = []
    propCount = lap.GetPropertyCount(localProp)
    for p in range(propCount):
        pname = lap.GetPropertyName(p)
        if re.search(r'name|lap|time|number', pname, re.IGNORECASE):
            parts.append(f'{pname}={lap.GetPropertyData(p)}')
    return '  '.join(parts) if parts else '(no info)'


def select_lap(run):
    lapCount = run.GetLapCount()
    if lapCount == 0:
        print('No laps found in this run.')
        return None

    print('\n=== Available Laps ===')
    for l in range(lapCount):
        lap = run.GetLap(l)
        lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))
        print(f'  [{l:>3}] {_get_lap_label(lap)}')

    while True:
        choice = input(f'\nSelect lap ID [0-{lapCount-1}]: ').strip()
        try:
            i = int(choice)
            if 0 <= i < lapCount:
                lap = run.GetLap(i)
                return win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))
        except ValueError:
            pass
        print(f'  Please enter a number between 0 and {lapCount-1}.')


# ---------------------------------------------------------------------------
# Channel helpers
# ---------------------------------------------------------------------------

def list_channels(lap):
    """Return list of (idx, name, sample_rate, sample_count, chan_obj)."""
    chanCount = lap.GetChanCount()
    channels = []
    for c in range(chanCount):
        chan = lap.GetChan(c)
        chan = win32com.client.Dispatch(chan.QueryInterface(pythoncom.IID_IDispatch))
        channels.append((c, chan.Name, int(chan.SampleRate), chan.SampleCount, chan))
    return channels


def select_channels(lap):
    channels = list_channels(lap)
    if not channels:
        print('No channels found in this lap.')
        return []

    print('\n=== Available Channels ===')
    for idx, name, rate, count, _ in channels:
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
# Reading & resampling
# ---------------------------------------------------------------------------

def read_channel(chan_obj, sample_count, sample_rate):
    """Read raw values and build a time axis (seconds from lap start)."""
    buffer = win32com.client.VARIANT(
        pythoncom.VT_ARRAY | pythoncom.VT_R8,
        [0.0] * sample_count
    )
    data = chan_obj.GetValues(0, buffer, sample_count, sample_count)
    values = np.array(data[0], dtype=np.float64)
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
    print(f'\nReading {len(channels)} channel(s)...')
    channel_data = []
    for idx, name, rate, count, chan_obj in channels:
        t, values = read_channel(chan_obj, count, rate)
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
