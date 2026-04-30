"""Map tuning and lookup table calculation endpoints."""

from typing import Dict, Optional
import numpy as np
from fastapi import APIRouter, HTTPException

from app.schemas import MapTuningRequest, MapTuningSaveResponse, MapTuningCalculateResponse
from app.services.lut_2D import LUT2D
from app.services.mat_loader import MatLoader
from app.routers.datasets import mat_loader

router = APIRouter(prefix="/api/map-tuning", tags=["map-tuning"])

# In-memory storage for map configurations
# Format: {config_name: {map_data}}
map_configs: Dict[str, dict] = {}


@router.post("/save", response_model=MapTuningSaveResponse)
async def save_map(payload: MapTuningRequest):
    """
    Save a map tuning configuration.

    This endpoint stores the map configuration in memory and would typically
    also persist it to a database or file.
    """
    try:
        if not payload.outputChannelName:
            raise HTTPException(status_code=400, detail="outputChannelName is required")

        if not payload.gridData or not payload.rowHeaders or not payload.colHeaders:
            raise HTTPException(status_code=400, detail="gridData, rowHeaders, and colHeaders are required")

        config_key = f"{payload.outputChannelName}_{payload.datasetId or 'local'}"

        map_configs[config_key] = {
            "inputChannelX": payload.inputChannelX,
            "inputChannelY": payload.inputChannelY,
            "outputChannelName": payload.outputChannelName,
            "gridData": np.array(payload.gridData),
            "rowHeaders": np.array(payload.rowHeaders),
            "colHeaders": np.array(payload.colHeaders),
            "datasetId": payload.datasetId,
            "braking_signal": payload.braking_signal,
            "gainVal": payload.gainVal,
            "offsetVal": payload.offsetVal
        }

        return {
            "message": f"Map '{payload.outputChannelName}' saved successfully",
            "mapId": config_key
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save map: {str(e)}")


# @router.post("/calculate", response_model=MapTuningCalculateResponse)
# async def calculate_map_output(payload: MapTuningRequest):
#     """
#     Calculate output channel based on map tuning.

#     This endpoint takes the current map configuration and applies it to
#     a dataset, creating a new computed output channel.
#     """
#     try:
#         if not payload.datasetId:
#             raise HTTPException(status_code=400, detail="datasetId is required")

#         if not payload.gridData or not payload.rowHeaders or not payload.colHeaders:
#             raise HTTPException(status_code=400, detail="gridData, rowHeaders, and colHeaders are required")

#         if not payload.inputChannelX or not payload.inputChannelY:
#             raise HTTPException(
#                 status_code=400, detail="inputChannelX and inputChannelY are required"
#             )

#         # Load the source dataset
#         dataset_tuple, available_id = mat_loader.get_dataset(payload.datasetId)
        
#         if not dataset_tuple:
#             raise HTTPException(status_code=404, detail=f"Dataset not found. Ensure it is loaded first.{payload.datasetId}, {available_id}")
            
#         df_normalized, metadata = dataset_tuple

#         # Create the 2D LUT object to store the 2D LUT characteristics
#         lut_object = LUT2D(
#             payload.inputChannelX,
#             payload.inputChannelY,
#             payload.rowHeaders,
#             payload.colHeaders,
#             payload.gridData,
#             payload.outputChannelName
#         )

#         # Compute the output channel (assuming LUT2D is callable on the DataFrame directly)
#         output_values = lut_object(df_normalized)
        
#         # Ensure output is a numpy array for processing
#         if not isinstance(output_values, np.ndarray):
#             output_values = np.array(output_values)

#         # We add the new channel to the dataset for future display
#         mat_loader.add_new_channel(payload.outputChannelName, output_values)

#         return {
#             "message": f"Map '{payload.outputChannelName}' calculated successfully",
#             "samplesProcessed": output_values.size,
#             "outputSignal": output_values.tolist() # Convert to list for JSON serialization
#         }

#     except Exception as e:
#         raise HTTPException(
#             status_code=500, detail=f"Failed to calculate map output: {str(e)}"
#         )


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