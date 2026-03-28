# MAT Format Convention

## Goal
Define a stable MAT input convention for racing telemetry indexed by lap progress.

## Mandatory variables
- `lap_distance`: 1D array in meters, monotonically increasing
- Signal variables: one variable per signal (same length as `lap_distance`)

## Recommended variable
- `distance_step_m`: spatial sampling step in meters (distance between two points)

## Fallback if distance_step_m is missing
- Compute source spatial step using median delta of `lap_distance`.

## Validation rules
- `lap_distance` length >= 2
- all signal arrays have same length as `lap_distance`
- source spatial step > 0
- no NaN in `lap_distance`

## Normalization rule (Parquet export)
- All signals are resampled to app reference step `reference_distance_step_m`
- Interpolation method: linear interpolation
- If source step is larger than reference step: enrich points with interpolation
- If source step is smaller than reference step: resample on reference grid

## Metadata to store per dataset
- `source_distance_step_m`
- `normalized_distance_step_m`
- `interpolation_method` = `linear`
- `enrichment_factor`
