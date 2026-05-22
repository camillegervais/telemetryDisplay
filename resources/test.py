import winreg

def find_progids():
    progids = []
    # Open the root folder of classes in Windows Registry
    with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, "") as root:
        index = 0
        while True:
            try:
                # Grab the name of the registry key
                key_name = winreg.EnumKey(root, index)
                
                # Filter for typical app names containing a dot (e.g., "Excel.Application")
                # and making sure it has a registered CLSID (Class Identifier) beneath it
                if "." in key_name and not key_name.startswith("."):
                    try:
                        with winreg.OpenKey(root, f"{key_name}\\CLSID"):
                            progids.append(key_name)
                    except FileNotFoundError:
                        pass
                index += 1
            except OSError:
                break # Reached the end of the registry key list
    return sorted(list(set(progids)))

# Print the first 50 discovered names as an example
all_apps = find_progids()
print(f"Found {len(all_apps)} available COM names. Here are a few:")
for app in all_apps:
    if 'teldata' in app.lower():  # Filter for names containing 'teldatax'
        print(f" - {app}")