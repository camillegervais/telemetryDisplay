"""
Simple signal filtering functions for math channels.
All functions work on numpy arrays and return numpy arrays.
"""

import logging
import numpy as np
import scipy.signal as signal
from scipy.signal import butter, filtfilt

logger = logging.getLogger(__name__)


def derivative(signal: np.ndarray, tLap: np.ndarray) -> np.ndarray:
    """
    Compute discrete derivative using central differences.
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
    
    Returns:
        Derivative array (same length as input, edges use forward/backward diff)
    """
    signal = np.asarray(signal, dtype=np.float64)
    tLap = np.asarray(tLap, dtype=np.float64)
    if len(signal) < 2:
        logger.warning(f"derivative: signal too short ({len(signal)} samples), returning zeros")
        return np.zeros_like(signal)
    if len(signal) != len(tLap):
        raise ValueError("derivative: signal and tLap must have the same length")
    
    deriv = np.zeros_like(signal)
    
    # Central differences in the middle
    deriv[1:-1] = (signal[2:] - signal[:-2]) / (tLap[2:] - tLap[:-2])
    
    # Forward difference at start
    deriv[0] = (signal[1] - signal[0]) / (tLap[1] - tLap[0])
    
    # Backward difference at end
    deriv[-1] = (signal[-1] - signal[-2]) / (tLap[-1] - tLap[-2])
    
    logger.debug(f"derivative: dt={np.mean(np.diff(tLap)):.4f}, output range=[{deriv.min():.4f}, {deriv.max():.4f}]")
    return deriv


def ratelimit(signal: np.ndarray, tLap: np.ndarray, min_rate: float, max_rate: float) -> np.ndarray:
    """
    Limit the rate of change of a signal.
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
        min_rate: Minimum allowed change between consecutive samples
        max_rate: Maximum allowed change between consecutive samples
    
    Returns:
        Rate-limited signal
    """
    signal = np.asarray(signal, dtype=np.float64)
    if len(signal) == 0:
        logger.warning("ratelimit: empty signal")
        return signal
    
    if max_rate <= 0:
        raise ValueError(f"ratelimit: max_rate must be > 0, got {max_rate}")
    
    dt = np.diff(tLap, prepend=tLap[0])
    result = np.zeros_like(signal)
    result[0] = signal[0]
    
    for i in range(1, len(signal)):
        delta = (signal[i] - result[i - 1]) / dt[i]
        # Clamp delta to [min_rate, max_rate]
        clamped_delta = np.clip(delta, min_rate, max_rate)
        result[i] = result[i - 1] + clamped_delta * dt[i]
    
    logger.debug(f"ratelimit: min_rate={min_rate}, max_rate={max_rate}, output range=[{result.min():.4f}, {result.max():.4f}]")
    return result

def ratelimit_dyn(signal: np.ndarray, tLap: np.ndarray, min_rate: np.ndarray, max_rate: np.ndarray) -> np.ndarray:
    """
    Limit the rate of change of a signal.
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
        min_rate: Minimum allowed change between consecutive samples (array of same length as signal)
        max_rate: Maximum allowed change between consecutive samples (array of same length as signal)
    
    Returns:
        Rate-limited signal
    """
    signal = np.asarray(signal, dtype=np.float64)
    tLap = np.asarray(tLap, dtype=np.float64)
    min_rate = np.asarray(min_rate, dtype=np.float64)
    max_rate = np.asarray(max_rate, dtype=np.float64)
    if len(signal) == 0:
        logger.warning("ratelimit_dyn: empty signal")
        return signal
    
    dt = np.diff(tLap, prepend=tLap[0])
    result = np.zeros_like(signal)
    result[0] = signal[0]
    
    for i in range(1, len(signal)):
        delta = (signal[i] - result[i - 1]) / dt[i]
        # Clamp delta to [min_rate, max_rate]
        clamped_delta = np.clip(delta, min_rate[i], max_rate[i])
        result[i] = result[i - 1] + clamped_delta * dt[i]
    
    logger.debug(f"ratelimit: min_rate={min_rate}, max_rate={max_rate}, output range=[{result.min():.4f}, {result.max():.4f}]")
    return result

def integral(signal: np.ndarray, tLap: np.ndarray) -> np.ndarray:
    """
    Compute cumulative integral using trapezoidal rule.
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
    
    Returns:
        Integrated signal (cumulative sum)
    """
    signal = np.asarray(signal, dtype=np.float64)
    tLap = np.asarray(tLap, dtype=np.float64)
    if len(signal) != len(tLap):
        raise ValueError("integral: signal and tLap must have the same length")
    if len(signal) == 0:
        logger.warning("integral: empty signal")
        return signal
    
    dt = np.diff(tLap, prepend=tLap[0])
    result = np.cumsum(signal * dt)
    logger.debug(f"integral: dt={np.mean(dt):.4f}, output range=[{result.min():.4f}, {result.max():.4f}]")
    return result

def lowpass_butterworth(signal_in: np.ndarray, *args, order: int = 2) -> np.ndarray:
    """Low-pass filter with flexible calling conventions.

    Calling options supported:
      - lowpass(signal, cutoff_hz)                         # scalar cutoff in Hz (no tLap provided)
      - lowpass(signal, order, cutoff_hz)                  # order (int), scalar cutoff (Hz)
      - lowpass(signal, tLap_array, cutoff_hz)            # tLap provided, cutoff scalar or array

    If `tLap` is provided (array-like matching signal length) the sampling
    frequency is inferred from median(dt). If only scalar cutoff is provided
    without `tLap`, the cutoff is interpreted as a normalized frequency in
    fraction-of-Nyquist (legacy behaviour).
    """
    signal_in = np.asarray(signal_in, dtype=np.float64)

    # Parse flexible args
    tLap = None
    cutoff_hz = None
    if len(args) == 1:
        cutoff_hz = args[0]
    elif len(args) == 2:
        # Could be (order, cutoff) or (tLap, cutoff)
        a1, a2 = args
        a1_arr = np.asarray(a1)
        if a1_arr.ndim > 0 and a1_arr.size == signal_in.size:
            tLap = a1_arr
            cutoff_hz = a2
        else:
            # treat as (order, cutoff)
            order = int(a1)
            cutoff_hz = a2
    elif len(args) > 2:
        raise ValueError("lowpass_butterworth: too many positional arguments")

    # Normalize cutoff into numpy array or scalar
    if cutoff_hz is None:
        raise ValueError("lowpass_butterworth: cutoff frequency required")
    cutoff_arr = np.asarray(cutoff_hz)

    # If tLap provided, validate and compute sampling frequency
    fs = None
    if tLap is not None:
        tLap = np.asarray(tLap, dtype=np.float64)
        if len(tLap) != len(signal_in):
            raise ValueError("lowpass_butterworth: tLap must match signal length")
        if len(tLap) < 2:
            raise ValueError("lowpass_butterworth: tLap must contain at least two samples")
        dt = np.diff(tLap)
        median_dt = np.median(dt)
        if median_dt <= 0:
            raise ValueError("lowpass_butterworth: non-positive time steps in tLap")
        fs = 1.0 / median_dt

    order = int(np.clip(order, 1, 8))

    # Scalar cutoff path
    if cutoff_arr.ndim == 0:
        scalar_cutoff = float(cutoff_arr)
        # If we have fs, treat cutoff as Hz, else interpret as normalized freq
        if fs is not None:
            normalized = float(np.clip(scalar_cutoff / (fs / 2.0), 0.001, 0.999))
        else:
            normalized = float(np.clip(scalar_cutoff, 0.001, 0.999))

        min_length = 2 * order + 1
        if len(signal_in) < min_length:
            logger.warning(f"lowpass_butterworth: signal too short ({len(signal_in)} samples). Skipping filter.")
            return signal_in

        try:
            b, a = signal.butter(order, normalized, btype='low')
            return signal.filtfilt(b, a, signal_in)
        except Exception as e:
            logger.error(f"lowpass_butterworth failed: {e}")
            raise ValueError(f"Low-pass filter failed: {e}")

    # Array cutoff path: dynamic cutoff over time — requires tLap
    if cutoff_arr.ndim == 1:
        if fs is None:
            raise ValueError("lowpass_butterworth: dynamic (array) cutoff requires tLap to be provided")
        if cutoff_arr.size != signal_in.size:
            raise ValueError("lowpass_butterworth: cutoff_hz array must match signal length")

        nperseg = min(256, len(signal_in))
        noverlap = nperseg // 2
        try:
            f, t_stft, Zxx = signal.stft(signal_in, fs=fs, nperseg=nperseg, noverlap=noverlap)
            cutoff_at_t = np.interp(t_stft, tLap, cutoff_arr)

            for col_idx, current_cutoff in enumerate(cutoff_at_t):
                idx = np.where(f > current_cutoff)[0]
                Zxx[idx, col_idx] = 0.0

            _, filtered_signal = signal.istft(Zxx, fs=fs, nperseg=nperseg, noverlap=noverlap)
            if len(filtered_signal) >= len(signal_in):
                return filtered_signal[:len(signal_in)]
            else:
                return np.pad(filtered_signal, (0, len(signal_in) - len(filtered_signal)), 'edge')
        except Exception as e:
            logger.error(f"lowpass_butterworth dynamic failed: {e}")
            raise ValueError(f"Dynamic low-pass filter failed: {e}")

    raise ValueError("lowpass_butterworth: unsupported cutoff_hz shape")


def highpass_butterworth(signal_in: np.ndarray, *args, order: int = 2) -> np.ndarray:
    """High-pass filter with flexible calling conventions (see lowpass docstring).
    Supports scalar or array cutoff. If array cutoff is used, a `tLap` array
    must be provided as the second positional argument.
    """
    signal_in = np.asarray(signal_in, dtype=np.float64)

    # Parse flexible args similar to lowpass
    tLap = None
    cutoff_hz = None
    if len(args) == 1:
        cutoff_hz = args[0]
    elif len(args) == 2:
        a1, a2 = args
        a1_arr = np.asarray(a1)
        if a1_arr.ndim > 0 and a1_arr.size == signal_in.size:
            tLap = a1_arr
            cutoff_hz = a2
        else:
            order = int(a1)
            cutoff_hz = a2
    elif len(args) > 2:
        raise ValueError("highpass_butterworth: too many positional arguments")

    if cutoff_hz is None:
        raise ValueError("highpass_butterworth: cutoff frequency required")
    cutoff_arr = np.asarray(cutoff_hz)

    fs = None
    if tLap is not None:
        tLap = np.asarray(tLap, dtype=np.float64)
        if len(tLap) != len(signal_in):
            raise ValueError("highpass_butterworth: tLap must match signal length")
        if len(tLap) < 2:
            raise ValueError("highpass_butterworth: tLap must contain at least two samples")
        dt = np.diff(tLap)
        median_dt = np.median(dt)
        if median_dt <= 0:
            raise ValueError("highpass_butterworth: non-positive time steps in tLap")
        fs = 1.0 / median_dt

    order = int(np.clip(order, 1, 8))

    # Scalar cutoff
    if cutoff_arr.ndim == 0:
        scalar_cutoff = float(cutoff_arr)
        if fs is not None:
            normalized = float(np.clip(scalar_cutoff / (fs / 2.0), 0.001, 0.999))
        else:
            normalized = float(np.clip(scalar_cutoff, 0.001, 0.999))

        min_length = 2 * order + 1
        if len(signal_in) < min_length:
            logger.warning(f"highpass_butterworth: signal too short ({len(signal_in)} samples). Skipping filter.")
            return signal_in

        try:
            b, a = signal.butter(order, normalized, btype='high')
            result = signal.filtfilt(b, a, signal_in)
            return result
        except Exception as e:
            logger.error(f"highpass_butterworth failed: {e}")
            raise ValueError(f"High-pass filter failed: {e}")

    # Array cutoff
    if cutoff_arr.ndim == 1:
        if fs is None:
            raise ValueError("highpass_butterworth: dynamic (array) cutoff requires tLap to be provided")
        if cutoff_arr.size != signal_in.size:
            raise ValueError("highpass_butterworth: cutoff_hz array must match signal length")

        nperseg = min(256, len(signal_in))
        noverlap = nperseg // 2
        try:
            f, t_stft, Zxx = signal.stft(signal_in, fs=fs, nperseg=nperseg, noverlap=noverlap)
            cutoff_at_t = np.interp(t_stft, tLap, cutoff_arr)

            for col_idx, current_cutoff in enumerate(cutoff_at_t):
                idx = np.where(f < current_cutoff)[0]
                Zxx[idx, col_idx] = 0.0

            _, filtered_signal = signal.istft(Zxx, fs=fs, nperseg=nperseg, noverlap=noverlap)
            if len(filtered_signal) >= len(signal_in):
                return filtered_signal[:len(signal_in)]
            else:
                return np.pad(filtered_signal, (0, len(signal_in) - len(filtered_signal)), 'edge')
        except Exception as e:
            logger.error(f"highpass_butterworth dynamic failed: {e}")
            raise ValueError(f"Dynamic high-pass filter failed: {e}")

    raise ValueError("highpass_butterworth: unsupported cutoff_hz shape")

def latch_time(signal_in: np.ndarray, tLap: np.ndarray, hold_time: float) -> np.ndarray:
    """
    Latch the last input > 0 for a duration hold_time seconds.
    Args:
    signal_in: input signal array
    tLap: time array (same length)
    hold_time: non-negative hold duration in seconds
    Returns:
    array of same length with 1.0 when latched, 0.0 otherwise
    """
    signal_in = np.asarray(signal_in, dtype=np.float64)
    tLap = np.asarray(tLap, dtype=np.float64)
    if hold_time is None:
        raise ValueError("latch_time: hold_time must be provided")
    hold_time = float(hold_time)
    if hold_time < 0:
        raise ValueError("latch_time: hold_time must be >= 0")
    if signal_in.size == 0:
        return np.array([], dtype=np.float64)
    if signal_in.size != tLap.size:
        raise ValueError("latch_time: signal and tLap must have same length")
    out = np.zeros_like(signal_in, dtype=np.float64)
    current_hold_end = -np.inf
    activations = 0
    new_end = 0
    for i, (s, t) in enumerate(zip(signal_in, tLap)):
        if s > 0:
            new_end = t + hold_time
        if new_end > current_hold_end:
            current_hold_end = new_end
            activations += 1
        if t < current_hold_end:
            out[i] = 1.0
    logger.debug(f"latch_time: activations={activations}, hold_time={hold_time}, output_mask_sum={out.sum()}")
    return out
    
if __name__ == "__main__":
    
    # Create a sample signal (sine wave + noise)
    fs = 100.0  # Sampling frequency
    t = np.arange(0, 10, 1/fs)  # 10 seconds duration
    signal_in = np.sin(2 * np.pi * 1.0 * t) + 0.5 * np.random.normal(size=t.shape)
    
    # Apply low-pass filter with a cutoff of 2 Hz
    cutoff = np.full_like(signal_in, 2.0)  # Dynamic cutoff (constant in this case)
    filtered_signal = lowpass_butterworth(signal_in, t, cutoff, order=4)
    
    print("Original signal (first 10 samples):", signal_in[:10])
    print("Filtered signal (first 10 samples):", filtered_signal[:10])