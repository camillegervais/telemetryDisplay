# User Guide - Telemetry Display

A lightweight visualization and analysis tool for telemetry data from WinTAX, simulations (Simulink), or real vehicle tracking. Designed quickly analyze and retune vehicle functions with interactive dashboards and custom calculations.

## Main functionalities

This tool helps you analyze vehicle telemetry data by:

- **Visualize data fast** – Import .mat files and instantly plot signals (RPM, throttle, brake, G-force, etc.)
- **Compare signals** – View multiple signals simultaneously across different graphs, zoom in/out, and filter by lap sections
- **Create custom channels** – Build new signals from existing ones using math expressions (e.g., `sqrt(gLong^2 + gLat^2)` for G-force)
- **Tune vehicle maps** – Edit 2D lookup tables and generate optimized output signals for tuning systems behaviour
- **Recreate Software block** - Recreate software behaviour to easily evaluate the change occured by carto tuning
- **Save your work** – Export and import complete configuration setups in a single file
- **Real-time sync** – Keep multiple browser tabs in sync with your updated data


## Application Layout

The interface consists of four main areas:

```
┌─────────────────────────────────────────────┐
│  Topbar: Logo | Profile | Mode Controls     │
├──────────┬──────────────────────────────────┤
│          │                                  │
│  Panel   │    Main Workspace                │
│  (Left)  │    • Tabbed analysis dashboard   │
│  Data    │    • Multi-graph visualization   │
│  Import  │    • Interactive zooming         │
│  + Stats │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

**Left Panel** – Toggle between two modes:
- **Data Hub**: Import datasets, view signal list, display statistics, quickly tune carto
- **Graph perso**: Fine-tune individual graph properties

**Main Workspace** – Multi-tab dashboard where you create and manage graphs

**Topbar** – Quick access to: import mode, panel swap, graph-only view, settings

## 1. Importing & Managing Data 

### Importing a Dataset

Click the **"⬆ IMPORT DATA"** button in the left panel to open the import modal. It has three tabs:

**Import MAT**
- **Browse**: Select a `.mat` file directly from your computer
- **MAT path**: Enter a full file path — useful for refreshing between simulation runs without re-browsing

**Récents**
- Lists the last 15 imported datasets
- Click **Load** to reload a previous dataset instantly
- Click **✕** next to an entry to remove it from the history

**TelData**
- Click **Open TelData… archive** to import from a TelData archive using a saved configuration

The application expects `.mat` files in the format specified in `MAT_FORMAT.md`.

Once imported:
- All signals become available in the **Signal List**
- Any existing graphs automatically populate with the new data
- The dataset persists across all open tabs
- To switch datasets, simply import another one or reimport from recent ones
- All software blocks that can be computed are computed and the signals are added to the signal list


## 2. Creating & Managing Graphs

### The Tab System

- **Create a tab**: Click `+ TAB`
- **Switch tabs**: Click the tab name
- Each tab is independent and persists between browser's tabs opened

### Creating Graphs

**Method 1 – Drag & Drop**:
- Drag a signal name from the **Signal List** onto any empty cell
- Graph creates automatically with that signal
- Drag another signal onto an existing graph to **add** it

**Method 2 – Quick Actions**:
- Press `+ Graph` to add a time-series graph
- Press `+ Graph XY` to add an XY (2D scatter) graph

### Graph Types

**Time-Series**: Multiple signals plotted over lap distance
- Shows signal values as the car progresses around the track
- Multiple signals can share or have separate Y-axes

**XY Plot**: One signal vs. another (scatter/trajectory)
- X-axis = first signal, Y-axis = second signal

### Signal color

If nothing is set up, the usual color sequence is used and the order is the order in which you drop the signals in the graph.

At the bottom of the `Import Panel` you can associate a color with a signal's name so that each time you drop a signal with that name on a graph, the signal trace has the selected color.

## 3. Interactive Controls & Navigation

### Zooming & Panning

- **Zoom in**: Click and drag across any plot area
- **Zoom to region**: Drag on plot to select a lap section (zooms all graphs)
- **Reset zoom**: Double-click any plot

### Signal Filtering

- **Hide a signal**: Click the signal name inside the plot legend
- **Show again**: Click the signal name again
- **Hide positive/negative values**: Use Inspector panel (see Advanced)

### Cursor & Crosshair

- Hover over any graph to see real-time values
- Distance indicator syncs across all graphs
- Cursor on the trackmap is synchronized with the indicator

**/!\\** To display the correct track map, include the name of the track in the name of the MAT file used as input. Here is the correspondance:

- Imola: `imola`
- Spa: `spa`
- Losail: `losail`
- Interlagos: `interlagos`
- Portimao: `portimao`
- Barhein: `barhein`
- Le Mans: `lemans` or `LeMans`

### Tabs configuration

You can have multiple tab configuration if you want to study part of the car. These configuration store only the tabs configuration: their name, their grid configuration and the graphs stored in them.

The following buttons help you manage your tab configurations:

- `LOAD` load the configuration selected in the input
- `SAVE` save the current configuration, a name is required: if you want to update your current configuration keep the same name, otherwise enter a new name
- `DELETE` delete the configuration from your computer: **cannot be undone**

**/!\\** The tab configuration only store and load the configuration of the graphs, cartos and software blocks (introduced further in that document) are not loaded. 

## 4. Math Channels & Custom Calculations

Create custom signals by combining existing signals with expressions.

### Adding a Math Channel

1. In the `Soft` tab, create a new block with only one Math operation
2. Enter:
   - **Name**: e.g., `Accel_X`
   - **Expression**: e.g., `gain(Ax, 9.81)` or `sqrt(Ax^2 + Ay^2)`, you can use the `?` button to get help on the syntax
3. New signal appears in the Signal List

Tips: You can create a software block reserved to simple Math Channels to avoid creating too much software blocks.

### Available Operations

**Arithmetic**: `+ - * /`  
**Comparison**: `> < >= <= == !=` → returns 0 (false) or 1 (true)

**Built-in Functions**:
- `gain(signal, factor)` – Multiply signal by constant
- `sqrt(x)`, `abs(x)`, `sign(x)` – Square root, absolute value, sign
- `min(a, b)`, `max(a, b)` – Minimum/maximum of two signals
- `norm2(a, b)` – Euclidean norm: √(a² + b²)
- `_and(a, b)`, `_or(a, b)`, `_xor(a, b)`, `_not(a)` – Logical operations
- `where(condition, val_if_true, val_if_false)` - Condition handling 

The complete set of available functions and operators is available in the app by clicking **"?"**- at the end in the matht channel input.

**Examples**:
```
G-force magnitude:      sqrt(Ax^2 + Ay^2)
Throttle in percent:    gain(Throttle, 100)
Active braking:         MBrakeR > 0
```

### Signal Statistics

All signals (original and math) display:
- **Mean, Std Dev, Min, Max**
- Located in a collapsible panel in the left sidebar
- Auto-updates when you import new data

## 5. Advanced Features

### Map Tuning (2D Lookup Tables)

Create interpolation maps for calibration tuning.

**Access**: Open the `MAP TUNING` tab

Different objects are available:
- A Map is a table linked to breakpoints that allow the evaluation of 2D map interpolated in between coefficient
- A Breakpoint is a 1D array that store a mapping of an axle.

A breakpoint is linked to one or many map. Its length should be the same as the corresponding dimension of the map it is linked to.

Breakpoints can be created for a specific case but mostly they are imported from TeamDB with a m file.

**How it works**:
1. Select **Breakpoints X** (columns) and **Breakpoints Y** (rows) breakpoint object created earlier.
2. Select the interpolation method and extrapolation method in case we hit breakpoints out of bounds.
3. Define grid dimensions (5×5, 10×10, etc.)
4. Edit or paste table values
5. Apply **Gain** and **Offset** scaling if needed
6. Click **"💾 Save** to save locally

**Features**:
- Save multiple configurations locally
- Load previously saved maps
- Heatmap visualization (green=low, red=high)
- Different type of interpolation: linear, round, nearest, floor
- Different type of extrapolation: linear and clamp
- Visualize the map in a 2D or 3D graph depending on the map dimension (click on **VIEW 3D**) to display
- Export the breakpoints and the values by copying the data in your clipboard (to paste in Excel or TeamDB for example)

**Map Import**:

These maps can be included in software blocks in the `Soft` tab. To compute their output they have to be included in a software block, whose output will be computed each time you change numerical values of the carto (gain, offset, breakpoints and value). The computation is done no matter where in the application you change the value.

The active set of maps and breakpoints can be imported from a car configuration through a m file downloaded from TeamDB. To do so, in the parameter editor tab you can select an assembly correponding to the session you are studying. Than you can export its configuration (select m file instead of clx in the file explorer).

Once the import is done you can find the exact same configuration as you had in the car so the signals emulated should follow the signal from the car.

### Software blocks

This is currently the most advanced feature of the application: it allow us to compute software blocks (Simulink blocks) output from the channel stored in the dataset. It is used to quickly evaluate the output of a software system where its parameters are changed.

**Construction**:
- A software block is composed of a serie of operation (mathematical or carto)
- Each operation has a name: it is the name of the output channel of the operation
- For each operation, the channel is added to the dataset so you can see all operations' output
- When creating an operation, as soon as the operation is correct, the signal is created so you can use it for the following operation
- Each operation are applied in the order in which they appear on the website, so the output of an operation can be the input of the following operation
- Every software blocks are computed when a dataset is imported: the computation stops when a signal is not there or an error happens

**Warning**:
- The application doesn't handle mux or bus: you have to do a channel per scalar channel
- Each software block is independent: it is not recommended to use a channel from a block in another block as the order of coputation is not guaranteed
- When a typo is made for the name of a operation, the signal with the wrong name is created and not deleted when the name is corrected. To delete the signal import the dataset once again

### Widget Inspector (Graph Personalisation)

Fine-tune individual graph properties:

1. Click the **red button** in the topbar to switch to **"Graphe Perso"** mode
2. Click a graph to select it
3. Adjust:
   - **Y-Axis Mode**: Align by origin only or by origin+scale
   - **Y-Axis Range**: Manually set min/max values
   - **Grid Position/Size**: Resize (1–4 spans) and reposition
   - **Hide Positive/Negative**: Filter values above/below zero
   - **Braking Filter**: Show only data during braking events (MBrakeR is not null, function active only if MBrakeR is in the dataset)

### Configuration Export & Import

Save your entire workspace (tabs, graphs, math channels, map configs):

1. **Export**: Press on the button **"📥 Export"** → downloads a `.toml` file
2. **Import**: Press on the button **"📤 Import"** → upload a saved `.toml` file

Useful for sharing analysis setups or archiving configurations.

### Cross-Tab Synchronization

- All changes sync automatically across open browser tabs
- Configurations persist in localStorage
- Close and reopen the app to restore your last session


## Tips & Best Practices

✓ **Import formats**: .mat files from WinTAX, MATLAB simulations, or custom data  
✓ **Batch analysis**: Use file path import to quickly cycle through simulation runs  
✓ **Save your setup**: Export configs to share analysis
✓ **Multi-view**: Use multiple tabs: one can be dedicated to carto tuning and the other to visualize the effect of the change on signals.


## Troubleshooting

**Graph not showing data after import?**  
→ Verify .mat file format matches `MAT_FORMAT.md` specification

**Math channel shows error?**  
→ Check syntax: all signal names are case-sensitive, use `+` not `sum()`

**Changes not syncing across tabs?**  
→ Ensure localStorage is enabled in browser settings




