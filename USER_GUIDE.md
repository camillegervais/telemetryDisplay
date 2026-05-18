# User Guide - Telemetry Display

A lightweight visualization and analysis tool for telemetry data from WinTAX, simulations (Simulink), or real vehicle tracking. Designed for performance engineers to quickly analyze and retune vehicle functions with interactive dashboards and custom calculations.


## Main functionalities

This tool helps you analyze vehicle telemetry data by:

- **Visualize data fast** – Import .mat files and instantly plot signals (RPM, throttle, brake, G-force, etc.)
- **Compare signals** – View multiple signals simultaneously across different graphs, zoom in/out, and filter by lap sections
- **Create custom channels** – Build new signals from existing ones using math expressions (e.g., `sqrt(gLong^2 + gLat^2)` for G-force)
- **Tune vehicle maps** – Edit 2D lookup tables and generate optimized output signals for tuning systems behaviour
- **Save your work** – Export and import complete analysis setups in a single file
- **Real-time sync** – Keep multiple browser tabs in sync with your latest configurations


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
- **Data Hub**: Import datasets, view signal list, display statistics
- **Graph Inspector**: Fine-tune individual graph properties

**Main Workspace** – Multi-tab dashboard where you create and manage graphs

**Topbar** – Quick access to: import mode, panel swap, graph-only view, settings


## 1. Importing & Managing Data 

### Importing a Dataset

1. Click **"IMPORT DE DONNEES"** in the left panel
2. Choose one of two methods:
   - **File Path**: Enter the folder path (pulls latest .mat file)
   - **Browse**: Select a .mat file directly from your computer

The application expects .mat files in the format specified in `MAT_FORMAT.md`.

Once imported:
- All signals become available in the **Signal List**
- Any existing graphs automatically populate with the new data
- The dataset persists across all open tabs
- To switch datasets, simply import another one (previous data cannot be recovered from the application itself)


## 2. Creating & Managing Graphs

### The Tab System

- **Create a tab**: Click `+ TAB` or press `T`
- **Switch tabs**: Click the tab name or press `Ctrl+Tab`
- Each tab is independent and persists in localStorage

### Creating Graphs

**Method 1 – Drag & Drop**:
- Drag a signal name from the **Signal List** onto any empty cell
- Graph creates automatically with that signal
- Drag another signal onto an existing graph to **add** it

**Method 2 – Quick Actions**:
- Press `A` to add a time-series graph
- Press `X` to add an XY (2D scatter) graph

### Graph Types

**Time-Series**: Multiple signals plotted over lap distance
- Shows signal values as the car progresses around the track
- Multiple signals can share or have separate Y-axes

**XY Plot**: One signal vs. another (scatter/trajectory)
- X-axis = first signal, Y-axis = second signal

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

## 4. Math Channels & Custom Calculations

Create custom signals by combining existing signals with expressions.

### Adding a Math Channel

1. In the left panel, find the **"Créer un Math Channel"** section
2. Enter:
   - **Name**: e.g., `Accel_X`
   - **Expression**: e.g., `gain(Ax, 9.81)` or `sqrt(Ax^2 + Ay^2)`
3. Click **"+ AJOUTER"**
4. New signal appears in the Signal List (with a ⚙️ icon)

### Available Operations

**Arithmetic**: `+ - * /`  
**Comparison**: `> < >= <= == !=` → returns 0 (false) or 1 (true)

**Built-in Functions**:
- `gain(signal, factor)` – Multiply signal by constant
- `sqrt(x)`, `abs(x)`, `sign(x)` – Square root, absolute value, sign
- `min(a, b)`, `max(a, b)` – Minimum/maximum of two signals
- `norm2(a, b)` – Euclidean norm: √(a² + b²)
- `and(a, b)`, `or(a, b)`, `xor(a, b)`, `not(a)` – Logical operations

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

**Access**: Click the **"TUNING DE CARTOGRAPHIE"** button

**How it works**:
1. Select **Input X** (columns) and **Input Y** (rows) channels
2. Define grid dimensions (5×5, 10×10, etc.)
3. Enter header values (breakpoints for each axis, Ctrl+V from Excel is possible)
4. Edit or paste table values (Ctrl+V from Excel is possible)
5. Apply **Gain** and **Offset** scaling if needed
6. Click **"💾 Sauvegarder"** to save locally
7. Click **"🔄 Calculer"** to process on the backend

**Features**:
- Save multiple configurations locally
- Load previously saved maps
- Heatmap visualization (green=low, red=high)
- Braking signal filtering option (signal active only when MBrakeR is not null)

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

1. **Export**: Press on the button **"📥 Exporter"**→ downloads a `.toml` file
2. **Import**: Press on the button **"📤 Importer"** → upload a saved `.toml` file

Useful for sharing analysis setups or archiving configurations.

### Cross-Tab Synchronization

- All changes sync automatically across open browser tabs
- Configurations persist in localStorage
- Close and reopen the app to restore your last session


## Keyboard Shortcuts

| Key | Function |
|-----|----------|
| `H` | Home |
| `G` | Graph-only mode (fullscreen) |
| `I` | Toggle Inspector |
| `P` | Swap panel (left/right) |
| `A` | Add time-series graph |
| `X` | Add XY graph |
| `T` | New tab |
| `Ctrl+S` | Export configuration |
| `Ctrl+O` | Import configuration |
| `Ctrl+Tab` | Switch tabs |
| `Del` | Delete selected graph |

While the application is in development, not all the keyboard shortcut are available.


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




