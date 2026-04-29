"""Map tuning and lookup table calculation endpoints."""

from typing import Dict, Optional
import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.config import config
from app.services.lut_2D import LUT2D
from app.services.mat_loader import MatLoader

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

        # Laod the source dataset
        mat_loader = MatLoader()
        dataset = mat_loader.get_dataset(datasetId)

        # Create the 2D LUT objecto to store the 2D LUT characteristics
        lut_object = LUT2D(
            inputChannelX,
            inputChannelY,
            rowHeaders,
            colHeaders,
            gridData,
            outputChannelName
        )

        # Compute the output channel
        output_values = lut_object(dataset)

        return {
            "success": True,
            "message": f"Map '{outputChannelName}' calculated successfully",
            "samplesProcessed": output_values.size,
            "outputChannelName": outputChannelName,
            "outputValues": output_values,
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
