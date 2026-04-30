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

    def __init__(self, x_axis_label, y_axis_label, x_axis_values, y_axis_values, lut_values, output_channel, braking_signal, gainVal, offsetVal):
        assert x_axis_values.size == lut_values.shape[0], 'Incorrect size for x axis'
        assert y_axis_values.size == lut_values.shape[1], 'Incorrect size for y axis'
        self.x_axis_label = x_axis_label
        self.y_axis_label = y_axis_label
        self.x_axis_values = x_axis_values
        self.y_axis_values = y_axis_values
        self.lut_values = lut_values
        self.output_channel = output_channel
        self.braking_signal = braking_signal
        self.gainVal = gainVal
        self.offsetVal = offsetVal

    def apply2DLUT(self, dataset: dict):
        """ Apply a 2D LUT on dataset's channels with the 2DLUT defined in lut_data """

        # Creating the interpolator
        lut_function = RegularGridInterpolator(
            (self.x_axis_values, self.y_axis_values),
            self.lut_values,
            method='linear',
            bounds_error=False,
            fill_value=None
        )

        # Formating the input points from the dataset
        input_points = np.column_stack((np.array(dataset[self.x_axis_label]).flatten(), np.array(dataset[self.y_axis_label]).flatten()))

        # Computing the result channel
        output_channel = np.array(lut_function(input_points))

        MBrakeR = np.array(dataset['MBrakeR']).flatten()

        if self.braking_signal:
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

