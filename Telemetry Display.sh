"C:\Program Files\Google\Chrome\Application\chrome.exe" http://localhost:5173/
SCRIPT_PATH=${0%/*}
if [ "$0" != "$SCRIPT_PATH" ] && [ "$SCRIPT_PATH" != "" ]; then 
    cd $SCRIPT_PATH
fi
npm run dev
^C
