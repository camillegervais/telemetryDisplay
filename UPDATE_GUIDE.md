# Code's update download procedure

During the development of the application, regular updates will be available with bug fix and new features, here are the steps to correctly get them:

1. Go in the folder where the application's source code (named `telemetryDisplay`) and be sure no other instance of the applciation is active (no Node window opened).
2. Right click on the folder and select `Open Git bash here`.
3. Be sure you have an internet connexion.
4. Type in a **Git Bash** terminal the following commands, {branch name} will be indicated in the annoucement message: 
```bash
git fetch
git checkout {branch name}
git pull
```
5. Relaunch the application with the script `Telemetry Display.sh`

**If needed** you can update Python depedencies by typing the following commands in a **Git Bash** terminal, in `telemetryDisplay`:

```bash
source .venv/Scripts/activate
python -m pip install -r requirements.txt
deactivate
```

**If needed** you can update Node depedencies by typing the following commands in a **Git Bash** terminal, in `telemetryDisplay`:


```bash
npm install
cd frontend
npm install
cd ..
```