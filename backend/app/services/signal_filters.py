"""
Simple signal filtering functions for math channels.
All functions work on numpy arrays and return numpy arrays.
"""

import numpy as np
from scipy.signal import butter, filtfilt


def derivative(signal: np.ndarray, dt: float = 1.0) -> np.ndarray:
    """
    Compute discrete derivative using central differences.
    
    Args:
        signal: Input signal array
        dt: Time or distance step (default 1.0). Result is scaled by 1/dt.
    
    Returns:
        Derivative array (same length as input, edges use forward/backward diff)
    """
    signal = np.asarray(signal, dtype=np.float64)
    deriv = np.zeros_like(signal)
    
    # Central differences in the middle
    deriv[1:-1] = (signal[2:] - signal[:-2]) / (2 * dt)
    
    # Forward difference at start
    deriv[0] = (signal[1] - signal[0]) / dt
    
    # Backward difference at end
    deriv[-1] = (signal[-1] - signal[-2]) / dt
    
    return deriv


def ratelimit(signal: np.ndarray, max_rate: float) -> np.ndarray:
    """
    Limit the rate of change of a signal.
    
    Args:
        signal: Input signal array
        max_rate: Maximum allowed change between consecutive samples
    
    Returns:
        Rate-limited signal
    """
    signal = np.asarray(signal, dtype=np.float64)
    if len(signal) == 0:
        return signal
    
    result = np.zeros_like(signal)
    result[0] = signal[0]
    
    for i in range(1, len(signal)):
        delta = signal[i] - result[i - 1]
        # Clamp delta to [-max_rate, max_rate]
        clamped_delta = np.clip(delta, -max_rate, max_rate)
        result[i] = result[i - 1] + clamped_delta
    
    return result


def integral(signal: np.ndarray, dt: float = 1.0) -> np.ndarray:
    """
    Compute cumulative integral using trapezoidal rule.
    
    Args:
        signal: Input signal array
        dt: Time or distance step (default 1.0). Integral is scaled by dt.
    
    Returns:
        Integrated signal (cumulative sum)
    """
    signal = np.asarray(signal, dtype=np.float64)
    # Trapezoidal integration: integral[i] = sum of (signal[j] + signal[j+1])/2 * dt
    return np.cumsum(signal * dt)


def lowpass_butterworth(signal: np.ndarray, order: int = 2, normalized_freq: float = 0.5) -> np.ndarray:
    """
    Apply Butterworth low-pass filter using filtfilt (zero-phase filtering).
    
    Args:
        signal: Input signal array
        order: Filter order (default 2, higher = steeper cutoff)
        normalized_freq: Normalized cutoff frequency (0 < freq < 1, where 1 = Nyquist)
                         Default 0.5 means cutoff at Nyquist/2
    
    Returns:
        Filtered signal
    """
    signal = np.asarray(signal, dtype=np.float64)
    
    # Clamp frequency to valid range
    normalized_freq = np.clip(normalized_freq, 0.01, 0.99)
    
    try:
        b, a = butter(order, normalized_freq, btype='low')
        return filtfilt(b, a, signal)
    except Exception:
        # If filtfilt fails, return original signal
        return signal


def highpass_butterworth(signal: np.ndarray, order: int = 2, normalized_freq: float = 0.1) -> np.ndarray:
    """
    Apply Butterworth high-pass filter using filtfilt (zero-phase filtering).
    
    Args:
        signal: Input signal array
        order: Filter order (default 2, higher = steeper cutoff)
        normalized_freq: Normalized cutoff frequency (0 < freq < 1, where 1 = Nyquist)
                         Default 0.1 means cutoff at Nyquist/10
    
    Returns:
        Filtered signal
    """
    signal = np.asarray(signal, dtype=np.float64)
    
    # Clamp frequency to valid range
    normalized_freq = np.clip(normalized_freq, 0.01, 0.99)
    
    try:
        b, a = butter(order, normalized_freq, btype='high')
        return filtfilt(b, a, signal)
    except Exception:
        # If filtfilt fails, return original signal
        return signal
