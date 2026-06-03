"""
Simple signal filtering functions for math channels.
All functions work on numpy arrays and return numpy arrays.
"""

import logging
import numpy as np
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


def lowpass_butterworth(signal: np.ndarray, tLap: np.ndarray, order: int = 2, cutoff_hz: float = 0.5) -> np.ndarray:
    """
    Apply Butterworth low-pass filter using filtfilt (zero-phase filtering).
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
        order: Filter order (default 2, higher = steeper cutoff)
        normalized_freq: Normalized cutoff frequency (0 < freq < 1, where 1 = Nyquist)
                         Default 0.5 means cutoff at Nyquist/2
    
    Returns:
        Filtered signal
        
    Raises:
        ValueError: If signal is too short or parameters invalid
    """
    signal = np.asarray(signal, dtype=np.float64)
    tLap = np.asarray(tLap, dtype=np.float64)
    if len(signal) != len(tLap):
        raise ValueError("lowpass_butterworth: signal and tLap must have the same length")
    
    # Validate signal length
    min_length = 2 * order + 1
    if len(signal) < min_length:
        logger.warning(
            f"lowpass_butterworth: signal too short ({len(signal)} samples) "
            f"for order={order} (min: {min_length}). Skipping filter."
        )
        return signal
    
    # Estimate sampling frequency from tLap (median dt)
    if len(tLap) < 2:
        raise ValueError("lowpass_butterworth: tLap must contain at least two samples to infer sampling rate")
    dt = np.diff(tLap)
    median_dt = np.median(dt)
    if median_dt <= 0:
        raise ValueError("lowpass_butterworth: non-positive time steps in tLap")
    fs = 1.0 / median_dt

    # Convert cutoff in Hz to normalized frequency (0..1 where 1 = Nyquist)
    normalized_freq = (cutoff_hz) / (fs / 2.0)
    # Clamp normalized frequency to valid range
    normalized_freq = float(np.clip(normalized_freq, 0.01, 0.99))
    
    # Clamp order to reasonable range
    order = int(np.clip(order, 1, 8))
    
    try:
        logger.debug(f"lowpass_butterworth: order={order}, cutoff_hz={cutoff_hz:.4f}, fs={fs:.4f}, normalized_freq={normalized_freq:.4f}")
        b, a = butter(order, normalized_freq, btype='low')
        result = filtfilt(b, a, signal)
        logger.debug(f"lowpass_butterworth: applied successfully, output range=[{result.min():.4f}, {result.max():.4f}]")
        return result
    except Exception as e:
        logger.error(f"lowpass_butterworth failed: {e}. Signal length: {len(signal)}, order: {order}, cutoff_hz: {cutoff_hz}")
        raise ValueError(f"Low-pass filter failed: {str(e)}")


def highpass_butterworth(signal: np.ndarray, tLap: np.ndarray, order: int = 2, cutoff_hz: float = 0.1) -> np.ndarray:
    """
    Apply Butterworth high-pass filter using filtfilt (zero-phase filtering).
    
    Args:
        signal: Input signal array
        tLap: Time or distance step array (must be same length as signal, can be non-uniform)
        order: Filter order (default 2, higher = steeper cutoff)
        normalized_freq: Normalized cutoff frequency (0 < freq < 1, where 1 = Nyquist)
                         Default 0.1 means cutoff at Nyquist/10
    
    Returns:
        Filtered signal
        
    Raises:
        ValueError: If signal is too short or parameters invalid
    """
    signal = np.asarray(signal, dtype=np.float64)
    
    # Validate signal length
    min_length = 2 * order + 1
    if len(signal) < min_length:
        logger.warning(
            f"highpass_butterworth: signal too short ({len(signal)} samples) "
            f"for order={order} (min: {min_length}). Skipping filter."
        )
        return signal
    
    # Estimate sampling frequency from tLap (median dt)
    if len(tLap) < 2:
        raise ValueError("highpass_butterworth: tLap must contain at least two samples to infer sampling rate")
    dt = np.diff(tLap)
    median_dt = np.median(dt)
    if median_dt <= 0:
        raise ValueError("highpass_butterworth: non-positive time steps in tLap")
    fs = 1.0 / median_dt

    # Convert cutoff in Hz to normalized frequency (0..1 where 1 = Nyquist)
    normalized_freq = (cutoff_hz) / (fs / 2.0)
    # Clamp normalized frequency to valid range
    normalized_freq = float(np.clip(normalized_freq, 0.01, 0.99))
    
    # Clamp order to reasonable range
    order = int(np.clip(order, 1, 8))
    
    # Clamp order to reasonable range
    order = int(np.clip(order, 1, 8))

    try:
        logger.debug(f"highpass_butterworth: order={order}, cutoff_hz={cutoff_hz:.4f}, fs={fs:.4f}, normalized_freq={normalized_freq:.4f}")
        b, a = butter(order, normalized_freq, btype='high')
        result = filtfilt(b, a, signal)
        logger.debug(f"highpass_butterworth: applied successfully, output range=[{result.min():.4f}, {result.max():.4f}]")
        return result
    except Exception as e:
        logger.error(f"highpass_butterworth failed: {e}. Signal length: {len(signal)}, order: {order}, cutoff_hz: {cutoff_hz}")
        raise ValueError(f"High-pass filter failed: {str(e)}")
