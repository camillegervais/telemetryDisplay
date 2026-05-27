import scipy.io
import numpy as np
from scipy.interpolate import RegularGridInterpolator
import matplotlib.pyplot as plt 
import pandas as pd

class LUT2D:
    """Class storing all th evalues defining a 2D LUT"""
    x_axis_label: str
    y_axis_label: str
    x_axis_values: np.ndarray
    y_axis_values: np.ndarray
    lut_values: np.ndarray
    output_channel: str
    braking_signal: bool
    gainVal: float
    offsetVal: float
    interpolation: str
    extrapolation: str  # 'clamp' or 'linear'

    def __init__(self, x_axis_label, y_axis_label, x_axis_values, y_axis_values, lut_values, output_channel, braking_signal, gainVal, offsetVal, interpolation='linear', extrapolation='clamp'):
        # Allow 2D LUTs as well as degenerate 1D shapes where one dimension may be 1.
        if lut_values.ndim != 2:
            raise AssertionError('lut_values must be 2D')
        nx = x_axis_values.size
        ny = y_axis_values.size
        lx, ly = lut_values.shape
        if not ((lx == nx and ly == ny) or (lx == 1 and ly == ny) or (lx == nx and ly == 1) or (lx == 1 and ly == 1)):
            raise AssertionError(f'Incorrect LUT shape for provided axes: lut={lut_values.shape}, x_axis={nx}, y_axis={ny}')
        self.x_axis_label = x_axis_label
        self.y_axis_label = y_axis_label
        self.x_axis_values = x_axis_values
        self.y_axis_values = y_axis_values
        self.lut_values = lut_values
        self.output_channel = output_channel
        self.braking_signal = braking_signal
        self.gainVal = gainVal
        self.offsetVal = offsetVal
        self.interpolation = interpolation
        self.extrapolation = extrapolation if extrapolation in {'clamp', 'linear'} else 'clamp'

    def _clamp_axis_indices(self, values: np.ndarray, axis: np.ndarray, mode: str) -> np.ndarray:
        if axis.size == 1:
            return np.zeros(values.shape, dtype=int)

        clipped = np.clip(values, axis[0], axis[-1])
        if mode == 'floor':
            indices = np.searchsorted(axis, clipped, side='right') - 1
        else:
            right_indices = np.searchsorted(axis, clipped, side='left')
            right_indices = np.clip(right_indices, 0, axis.size - 1)
            left_indices = np.clip(right_indices - 1, 0, axis.size - 1)
            left_delta = np.abs(clipped - axis[left_indices])
            right_delta = np.abs(axis[right_indices] - clipped)
            indices = np.where(left_delta <= right_delta, left_indices, right_indices)

        return np.clip(indices, 0, axis.size - 1).astype(int)

    def _apply_discrete_2d(self, x_data: np.ndarray, y_data: np.ndarray, x_vals: np.ndarray, y_vals: np.ndarray, lut: np.ndarray, mode: str) -> np.ndarray:
        x_indices = self._clamp_axis_indices(x_data, x_vals, mode)
        y_indices = self._clamp_axis_indices(y_data, y_vals, mode)
        return lut[x_indices, y_indices]

    def _apply_1d(self, data: np.ndarray, axis: np.ndarray, values: np.ndarray, mode: str, extrapolate: bool = False) -> np.ndarray:
        normalized_mode = mode if mode in {'floor', 'nearest', 'linear', 'round'} else 'linear'
        if normalized_mode == 'linear':
            if extrapolate and axis.size >= 2:
                # Linear extrapolation using the slope of the two outermost breakpoints
                result = np.interp(data, axis, values, left=values[0], right=values[-1])
                left_mask = data < axis[0]
                right_mask = data > axis[-1]
                if np.any(left_mask):
                    slope = (values[1] - values[0]) / (axis[1] - axis[0])
                    result[left_mask] = values[0] + slope * (data[left_mask] - axis[0])
                if np.any(right_mask):
                    slope = (values[-1] - values[-2]) / (axis[-1] - axis[-2])
                    result[right_mask] = values[-1] + slope * (data[right_mask] - axis[-1])
                return result
            return np.interp(data, axis, values, left=values[0], right=values[-1])

        indices = self._clamp_axis_indices(data, axis, 'floor' if normalized_mode == 'floor' else 'round')
        return values[indices]

    def apply2DLUT(self, dataset: dict):
        """ Apply a 2D LUT on dataset's channels with the 2DLUT defined in lut_data """
        # Determine sizes
        x_vals = np.asarray(self.x_axis_values).flatten()
        y_vals = np.asarray(self.y_axis_values).flatten()
        lut = np.asarray(self.lut_values)

        nx = x_vals.size
        ny = y_vals.size
        lx, ly = lut.shape

        x_data = np.array(dataset[self.x_axis_label]).flatten()
        y_data = np.array(dataset[self.y_axis_label]).flatten()

        if x_data.size != y_data.size:
            # Align lengths by broadcasting shorter to longer if possible
            length = max(x_data.size, y_data.size)
            if x_data.size == 1:
                x_data = np.full(length, x_data.item())
            if y_data.size == 1:
                y_data = np.full(length, y_data.item())
        length = x_data.size

        # Case: full 2D LUT
        if lx == nx and ly == ny:
            x_min, x_max = x_vals.min(), x_vals.max()
            y_min, y_max = y_vals.min(), y_vals.max()
            x_data_clipped = np.clip(x_data, x_min, x_max)
            y_data_clipped = np.clip(y_data, y_min, y_max)
            mode = self.interpolation if self.interpolation in {'floor', 'nearest', 'linear', 'round'} else 'linear'

            if mode in {'linear', 'nearest'}:
                lut_function = RegularGridInterpolator(
                    (x_vals, y_vals),
                    lut,
                    method=mode,
                    bounds_error=False,
                    fill_value=None,
                )
                # For 'linear' mode, scipy extrapolates linearly when fill_value=None;
                # for 'nearest' mode it uses nearest boundary (equivalent to clamping).
                if self.extrapolation == 'linear' and mode == 'linear':
                    input_points = np.column_stack((x_data, y_data))
                else:
                    input_points = np.column_stack((x_data_clipped, y_data_clipped))
                output_channel = np.array(lut_function(input_points))
            else:
                discrete_mode = 'floor' if mode == 'floor' else 'round'
                # Discrete modes always clamp; linear extrapolation does not apply
                output_channel = self._apply_discrete_2d(x_data_clipped, y_data_clipped, x_vals, y_vals, lut, discrete_mode)

        # Case: LUT has single row (lx == 1) — treat as 1D over y (use y axis values)
        elif lx == 1 and ly >= 1:
            # Use the single row lut[0, :] indexed by y_vals
            row = lut[0, :]
            output_channel = self._apply_1d(y_data, y_vals, row, self.interpolation, extrapolate=(self.extrapolation == 'linear'))

        # Case: LUT has single column (ly == 1) — treat as 1D over x (use x axis values)
        elif ly == 1 and lx >= 1:
            col = lut[:, 0]
            output_channel = self._apply_1d(x_data, x_vals, col, self.interpolation, extrapolate=(self.extrapolation == 'linear'))

        # Fallback: degenerate constant
        else:
            output_channel = np.full(x_data.shape, float(lut.flat[0]))

        # Apply braking mask if requested
        if self.braking_signal and 'MBrakeR' in dataset:
            MBrakeR = np.array(dataset['MBrakeR']).flatten()
            # Ensure same length
            if MBrakeR.size != output_channel.size:
                if MBrakeR.size == 1:
                    MBrakeR = np.full(output_channel.size, MBrakeR.item())
                else:
                    # truncate or pad as needed
                    MBrakeR = np.resize(MBrakeR, output_channel.size)
            output_channel = np.where(MBrakeR > np.min(MBrakeR) * 0.1, np.nan, output_channel)

        output_channel = self.gainVal * output_channel + self.offsetVal

        return output_channel

if __name__ == "__main__":

    # Loading the data from the MAT file exported from WinTAX
    filename = "c:/user/TA37428/Documents/cartoTuner/data_test/Tr001_Abs00022762_VCU_DIL_Lap0_cableData.mat"

    data = scipy.io.loadmat(filename)

    # Preparing the LUT data
    lut_y_values_rTorqueBal = np.array([0,2,50,75,100,125,150,175,200,225,250,275,300,325,350])
    lut_x_values_rTorqueBal = np.array([-4800,-4600,-4400,-4200,-4000,-3800,-3600,-3400,-3200,-3000,-2800,-2600,-2400,-2200,-2000,-1800,-1600,-1400,-1200,-1000,-800,-600,-400,-200,0])
    lut_values_rTorqueBal = np.array([0, 64.317, 64.497, 64.607, 64.730, 64.857, 65.000, 65.200, 65.500, 65.857, 66.407, 67.113, 67.950, 69.093, 70.633])

    lut_values_rTorqueBal = lut_values_rTorqueBal.reshape(-1, lut_values_rTorqueBal.size).repeat(len(lut_x_values_rTorqueBal), 0)

    # Creating the 2DLUT object
    lut_object_rTorqueBal = LUT2D('MBrakeR', 'vCarRef', lut_x_values_rTorqueBal, lut_y_values_rTorqueBal, lut_values_rTorqueBal, 'rTorqueBal', True)

    output_rTorqueBal = lut_object_rTorqueBal.apply2DLUT(data)

    # plt.plot(output_rTorqueBal)

    lut_y_EOB = np.arange(-3.5, 4.0, 0.5)
    lut_x_EOB = np.array([0,2,50,75,100,125,150,175,200,225,250,275,300,325,350])

    lut_values_EOB = np.array([[1.00,	1.00,	1.00,	0.86,	0.71,	0.57,	0.43,	0.29,	0.14,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.99,	0.99,	0.99,	0.85,	0.71,	0.56,	0.42,	0.28,	0.14,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.71,	0.71,	0.71,	0.61,	0.51,	0.41,	0.31,	0.20,	0.10,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.57,	0.57,	0.57,	0.49,	0.41,	0.33,	0.24,	0.16,	0.08,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.43,	0.43,	0.43,	0.37,	0.31,	0.24,	0.18,	0.12,	0.06,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.29,	0.29,	0.29,	0.24,	0.20,	0.16,	0.12,	0.08,	0.04,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.14,	0.14,	0.14,	0.12,	0.10,	0.08,	0.06,	0.04,	0.02,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.07,	0.07,	0.07,	0.06,	0.05,	0.04,	0.03,	0.02,	0.01,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.14,	0.14,	0.14,	0.12,	0.10,	0.08,	0.06,	0.04,	0.02,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.29,	0.29,	0.29,	0.24,	0.20,	0.16,	0.12,	0.08,	0.04,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.43,	0.43,	0.43,	0.37,	0.31,	0.24,	0.18,	0.12,	0.06,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.57,	0.57,	0.57,	0.49,	0.41,	0.33,	0.24,	0.16,	0.08,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.71,	0.71,	0.71,	0.61,	0.51,	0.41,	0.31,	0.20,	0.10,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [0.99,	0.99,	0.99,	0.85,	0.71,	0.56,	0.42,	0.28,	0.14,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00],
    [1.00,	1.00,	1.00,	0.86,	0.71,	0.57,	0.43,	0.29,	0.14,	0.00,	0.00,	0.00,	0.00,	0.00,	0.00,]])

    lut_object_EOB = LUT2D('vCarRef', 'gLat', lut_x_EOB, lut_y_EOB, lut_values_EOB, 'EOB', True)

    output_EOB = lut_object_EOB.apply2DLUT(data)

    plt.plot(output_EOB)
    # plt.plot(output_EOB + output_rTorqueBal)
    plt.show()

