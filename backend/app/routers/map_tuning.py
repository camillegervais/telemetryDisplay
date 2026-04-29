"""Map tuning and lookup table calculation endpoints."""

from typing import Dict, Optional
import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.config import config

router = APIRouter(prefix="/api/map-tuning", tags=["map-tuning"])

# In-memory storage for map configurations
# Format: {config_name: {map_data}}
map_configs: Dict[str, dict] = {}


class MapTuningRequest:
    """Represent a map tuning request"""

    def __init__(
        self,
        datasetId: Optional[str],
        inputChannelX: str,
        inputChannelY: str,
        outputChannelName: str,
        gridData: list[list[float]],
        rowHeaders: list[float],
        colHeaders: list[float],
    ):
        self.datasetId = datasetId
        self.inputChannelX = inputChannelX
        self.inputChannelY = inputChannelY
        self.outputChannelName = outputChannelName
        self.gridData = np.array(gridData)
        self.rowHeaders = np.array(rowHeaders)
        self.colHeaders = np.array(colHeaders)


def interpolate_map_value(
    grid: np.ndarray,
    row_headers: np.ndarray,
    col_headers: np.ndarray,
    x_val: float,
    y_val: float,
) -> float:
    """
    Bilinear interpolation on 2D lookup table.

    Args:
        grid: 2D array of map values
        row_headers: Y-axis values
        col_headers: X-axis values
        x_val: X value to look up
        y_val: Y value to look up

    Returns:
        Interpolated value
    """
    # Clamp to bounds
    x_val = np.clip(x_val, col_headers.min(), col_headers.max())
    y_val = np.clip(y_val, row_headers.min(), row_headers.max())

    # Find bracketing indices
    x_idx = np.searchsorted(col_headers, x_val)
    y_idx = np.searchsorted(row_headers, y_val)

    # Clamp to grid bounds
    x_idx = np.clip(x_idx, 1, len(col_headers) - 1)
    y_idx = np.clip(y_idx, 1, len(row_headers) - 1)

    # Get the four surrounding points
    x0, x1 = col_headers[x_idx - 1], col_headers[x_idx]
    y0, y1 = row_headers[y_idx - 1], row_headers[y_idx]

    f00 = grid[y_idx - 1, x_idx - 1]
    f10 = grid[y_idx - 1, x_idx]
    f01 = grid[y_idx, x_idx - 1]
    f11 = grid[y_idx, x_idx]

    # Bilinear interpolation
    dx = (x_val - x0) / (x1 - x0) if x1 > x0 else 0
    dy = (y_val - y0) / (y1 - y0) if y1 > y0 else 0

    f0 = f00 * (1 - dx) + f10 * dx
    f1 = f01 * (1 - dx) + f11 * dx
    result = f0 * (1 - dy) + f1 * dy

    return float(result)


@router.post("/save")
async def save_map(
    datasetId: Optional[str] = None,
    inputChannelX: str = "",
    inputChannelY: str = "",
    outputChannelName: str = "",
    gridData: list[list[float]] = [],
    rowHeaders: list[float] = [],
    colHeaders: list[float] = [],
):
    """
    Save a map tuning configuration.

    This endpoint stores the map configuration in memory and would typically
    also persist it to a database or file.
    """
    try:
        if not outputChannelName:
            raise HTTPException(status_code=400, detail="outputChannelName is required")

        if not gridData or not rowHeaders or not colHeaders:
            raise HTTPException(status_code=400, detail="gridData, rowHeaders, and colHeaders are required")

        config_key = f"{outputChannelName}_{datasetId or 'local'}"

        map_configs[config_key] = {
            "inputChannelX": inputChannelX,
            "inputChannelY": inputChannelY,
            "outputChannelName": outputChannelName,
            "gridData": gridData,
            "rowHeaders": rowHeaders,
            "colHeaders": colHeaders,
            "datasetId": datasetId,
        }

        return {
            "success": True,
            "message": f"Map '{outputChannelName}' saved successfully",
            "configKey": config_key,
            "samplesStored": len(gridData) * len(gridData[0]) if gridData else 0,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save map: {str(e)}")


@router.post("/calculate")
async def calculate_map_output(
    datasetId: Optional[str] = None,
    inputChannelX: str = "",
    inputChannelY: str = "",
    outputChannelName: str = "",
    gridData: list[list[float]] = [],
    rowHeaders: list[float] = [],
    colHeaders: list[float] = [],
):
    """
    Calculate output channel based on map tuning.

    This endpoint takes the current map configuration and would apply it to
    a dataset, creating a new computed output channel.

    In a full implementation, this would:
    1. Load the dataset by datasetId
    2. Extract inputChannelX and inputChannelY columns
    3. Interpolate through the lookup table for each row
    4. Return the computed output values
    """
    try:
        if not datasetId:
            raise HTTPException(status_code=400, detail="datasetId is required")

        if not gridData or not rowHeaders or not colHeaders:
            raise HTTPException(status_code=400, detail="gridData, rowHeaders, and colHeaders are required")

        if not inputChannelX or not inputChannelY:
            raise HTTPException(
                status_code=400, detail="inputChannelX and inputChannelY are required"
            )

        # Create map objects
        req = MapTuningRequest(
            datasetId=datasetId,
            inputChannelX=inputChannelX,
            inputChannelY=inputChannelY,
            outputChannelName=outputChannelName,
            gridData=gridData,
            rowHeaders=rowHeaders,
            colHeaders=colHeaders,
        )

        # TODO: In full implementation:
        # 1. mat_loader.get_dataset(datasetId) -> (df, metadata)
        # 2. Extract x_data = df[inputChannelX], y_data = df[inputChannelY]
        # 3. For each row: output[i] = interpolate_map_value(grid, y_headers, x_headers, x_data[i], y_data[i])
        # 4. Add as new column to dataset or return as array

        # Mock implementation: simulate interpolation
        num_samples = 100  # Would be len(df) in real scenario
        output_values = []

        for i in range(num_samples):
            # Mock input values (would come from dataset)
            x_val = req.colHeaders[0] + (req.colHeaders[-1] - req.colHeaders[0]) * (i / num_samples)
            y_val = req.rowHeaders[0] + (req.rowHeaders[-1] - req.rowHeaders[0]) * (i / num_samples)

            output_val = interpolate_map_value(
                req.gridData, req.rowHeaders, req.colHeaders, x_val, y_val
            )
            output_values.append(output_val)

        return {
            "success": True,
            "message": f"Map '{outputChannelName}' calculated successfully",
            "samplesProcessed": num_samples,
            "outputChannelName": outputChannelName,
            "outputValues": output_values[:10],  # Return first 10 values as preview
            "outputStats": {
                "min": float(np.min(output_values)),
                "max": float(np.max(output_values)),
                "mean": float(np.mean(output_values)),
                "std": float(np.std(output_values)),
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to calculate map output: {str(e)}"
        )


@router.get("/configs")
async def get_saved_configs():
    """Get all saved map configurations."""
    return {
        "configs": list(map_configs.keys()),
        "count": len(map_configs),
    }


@router.get("/configs/{config_key}")
async def get_config(config_key: str):
    """Get a specific saved map configuration."""
    if config_key not in map_configs:
        raise HTTPException(status_code=404, detail="Configuration not found")

    return map_configs[config_key]
