# Two-Step Carto Import Guide

## Overview

The carto import system now supports a two-step workflow:
1. **Step 1**: Import breakpoints (1D arrays) from .m files
2. **Step 2**: Import 2D cartos and link them to existing breakpoints

This design allows independent control over what gets imported and ensures that cartos are only imported when their dependent breakpoints are available.

## How to Use

### Step 1: Import Breakpoints

1. In the **Map Tuning** panel, click the **"📥 Import .m"** button
2. Select a MATLAB .m file containing breakpoints
3. A modal appears showing all detected breakpoints
4. Review the list:
   - **Breakpoint name** (e.g., `RPM_Engine`)
   - **Number of values** and first few values (e.g., `10 values: 0.00, 500.00, 1000.00...`)
   - **Unit** if available (e.g., "rpm")
5. Use **"Select All"** or manually check individual breakpoints
6. Click **"Next →"** to proceed to Step 2

### Step 2: Import Cartos

1. A new modal appears showing all detected 2D cartos from the file
2. Review the cartos:
   - **Carto name** (e.g., `Injection_Map`)
   - **Grid dimensions** (e.g., "12 rows × 8 cols")
   - **Gain and Offset** values
3. Each carto shows its size to help verify they'll fit the breakpoint grid
4. Use **"Select All"** or manually check individual cartos to import
5. Click **"Import"** to start the import process

### Step 3: Review Results

After import completes, a summary modal shows:
- ✅ **Breakpoints Created** - New breakpoints added
- 🔄 **Breakpoints Updated** - Existing breakpoints with new values
- 📈 **Cartos Created** - New cartos added
- 🔧 **Cartos Updated** - Existing cartos with new grid data
- ⏭️ **Cartos Skipped** - Cartos not imported (e.g., missing breakpoints)
- ❌ **Errors** - Any validation errors encountered

## Merge Strategy

### Breakpoints (Step 1)
- **By Name**: If a breakpoint with the same name exists, its values are updated
- **Auto-Create**: New breakpoints are created with unique keys if names are new
- **No Deletion**: Existing breakpoints never deleted

### Cartos (Step 2)
- **Breakpoint Validation**: Each carto must have valid X and Y axis breakpoints
- **Grid Size Check**: 
  - Number of rows must equal length of X breakpoint values
  - Number of columns must equal length of Y breakpoint values
- **By Name**: If a carto with the same name exists, grid data is updated
- **Auto-Create**: New cartos are created if names are new
- **Skip on Error**: Cartos with validation errors are skipped

## File Format Support

### MATLAB .m File Format

The system recognizes the VCU format with these patterns:

**Breakpoints (1D arrays):**
```matlab
c.APP_RPM_ENGINE_AXIS = [0; 500; 1000; 1500; 2000; ...];
c.APP_LOAD_XAXIS = [0; 10; 20; 30; ...];
c.APP_TORQUE_YAXIS = [0; 100; 200; ...];
c.APP_GEAR_BKP = [1; 2; 3; 4; 5; 6];
```

**2D Cartos (2D arrays):**
```matlab
c.APP_INJECTION_TABLE = [
  1.5, 2.0, 2.5, 3.0, 3.5;
  2.0, 2.5, 3.0, 3.5, 4.0;
  2.5, 3.0, 3.5, 4.0, 4.5;
  3.0, 3.5, 4.0, 4.5, 5.0;
  3.5, 4.0, 4.5, 5.0, 5.5
];

c.APP_TORQUE_MAP2D = [
  100, 150, 200;
  120, 170, 220;
  140, 190, 240
];
```

Multiline arrays are supported using `...` continuation:
```matlab
c.APP_LONG_ARRAY = [
  0; 100; 200; 300; ...
  400; 500; 600; 700; ...
  800; 900; 1000
];
```

## Example Workflow

### Scenario: Import RPM Compensation Map

1. **File selection**: Load `VCU320_tuning.m` containing:
   - `c.APP_RPM_ENGINE_AXIS` with 15 breakpoints
   - `c.APP_LOAD_ENGINE_AXIS` with 12 breakpoints
   - `c.APP_RPM_LOAD_TABLE` (15 rows × 12 cols)

2. **Step 1 - Breakpoints**:
   - Modal shows 2 breakpoints: `RPM_Engine` and `Load_Engine`
   - Both are auto-selected
   - User clicks "Next →"

3. **Step 2 - Cartos**:
   - Modal shows 1 carto: `RPM_Load_Table`
   - Grid dimensions match: 15 rows (RPM) × 12 cols (Load)
   - ✅ Status: Valid, ready to import
   - User clicks "Import"

4. **Results**:
   - Summary shows:
     - 1 breakpoint created (new)
     - 1 breakpoint updated (if existed)
     - 1 carto created (new)
   - All items synced across tabs via localStorage

## Troubleshooting

### "Breakpoint not found" Error

**Cause**: A carto references a breakpoint that doesn't exist in the file or wasn't imported

**Solution**:
1. Go back to Step 1
2. Make sure the required breakpoint was selected
3. Re-run the import process

### Grid Size Mismatch

**Cause**: Carto grid dimensions don't match breakpoint array lengths

**Example Error**: "X breakpoint size (10) doesn't match grid rows (8)"

**Solution**:
1. Check the MATLAB file to verify the carto was defined correctly
2. Ensure corresponding breakpoints have the right number of values

### Validation Failed - Empty Values

**Cause**: A breakpoint or carto has no data

**Solution**:
1. Check the original .m file
2. Ensure the array format is correct (semicolons separate rows in 2D)

## Cross-Tab Sync

After successful import, all changes are persisted to localStorage with keys:
- `breakpoint-configs` - All breakpoints (Record<string, BreakpointObject>)
- `carto-configs` - All cartos (Record<string, CartoObject>)

Other tabs automatically sync via `StorageEvent` listeners.

## API Reference

### Service Methods

#### `CartoImportService.importAndMergeBreakpoints(fileContent, adapter)`

**Parameters:**
- `fileContent: string` - Raw MATLAB file content
- `adapter: CartoAdapter` - Parser adapter (VcuAdapter)

**Returns:**
```typescript
{
  breakpointsCreated: string[];    // Keys of new breakpoints
  breakpointsUpdated: string[];    // Keys of modified breakpoints
  cartosAffected: string[];        // Keys of cartos referencing modified breakpoints
  errors: string[];                // Validation errors
}
```

#### `CartoImportService.importAndMergeCartos(fileContent, adapter, selectedCartoKeys)`

**Parameters:**
- `fileContent: string` - Raw MATLAB file content
- `adapter: CartoAdapter` - Parser adapter (VcuAdapter)
- `selectedCartoKeys: string[]` - Keys of cartos to import

**Returns:**
```typescript
{
  cartosCreated: string[];    // Keys of new cartos
  cartosUpdated: string[];    // Keys of modified cartos
  cartosSkipped: string[];    // Keys of cartos not imported
  errors: string[];           // Validation errors
}
```

## Component Hierarchy

```
MapTuning.tsx
  └── CartoImportPanel.tsx (File input, orchestration)
      ├── CartoImportModal.tsx (Step 1: Select breakpoints)
      ├── CartoSelectionModal.tsx (Step 2: Select cartos)
      └── ImportSummaryModal.tsx (Results)
```

## Implementation Details

### VcuAdapter Parser

- **Breakpoint Detection**: Variables with suffixes (Axis, XAxis, YAxis, Bkp)
- **Carto Detection**: Variables with suffixes (Table, Map2D) containing `;` (matrix row separator)
- **Multiline Support**: Continuation lines with `...` are handled automatically
- **Auto-Sort**: Breakpoint values are sorted numerically

### Validation Rules

1. **Breakpoints**:
   - Non-empty name required
   - Non-empty values array required
   - Values must be sorted in ascending order

2. **Cartos**:
   - Non-empty name required
   - Non-empty gridData required
   - All rows must have same column count
   - Referenced breakpoints must exist
   - Grid size must match breakpoint sizes

## See Also

- [MATLAB Format Documentation](./MAT_FORMAT.md)
- [Carto Import Implementation](./CARTO_IMPORT_IMPLEMENTATION.md)
