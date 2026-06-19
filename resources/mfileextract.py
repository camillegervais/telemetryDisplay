import os
import re
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# =====================================================================
# CONFIGURATION : Mets tes mots-clés ici (laisser en dur dans le script)
# =====================================================================
MOTS_CLES = ["rSlipABSTgtExtTgt_Map", "rSlipABSTgtInterTgt_Map", "rSlipABSTgtInterOffset_Map", "rSlipLatABSFinal_Map", "MTCROLDetailledEllipseMin_Map", "CTCROLCorneringStiffness_Map", "FyTCROLMax_Map", "FxTCROLMax_Map", "rTCROLFreeRollingTireR_Map", "rTCROLFreeRollingTireF_Map", ]
# =====================================================================

def process_extraction(m_file, output_file):
    """Fonction de traitement des données MATLAB -> Excel"""
    if not m_file or not output_file:
        messagebox.showerror("Erreur", "Veuillez sélectionner un fichier source et un fichier de sortie.")
        return

    if not MOTS_CLES:
        messagebox.showerror("Erreur", "La liste des mots-clés (MOTS_CLES) est vide dans le script.")
        return

    try:
        with open(m_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Nettoyage des continuations MATLAB '...'
        content = re.sub(r'\.\.\.\s*\n', ' ', content)

        # Regex pour capturer le nom et le contenu des crochets [...]
        pattern = re.compile(r'([\w\.]+)\s*=\s*\[(.*?)\]', re.DOTALL)
        matches = pattern.findall(content)

        output_lines = []
        count = 0

        for var_name, var_value in matches:
            # Filtrage avec la liste en dur
            if any(keyword in var_name for keyword in MOTS_CLES):
                raw_rows = var_value.split(';')
                excel_rows = []
                
                for row in raw_rows:
                    elements = re.findall(r'[-+]?\d*\.\d+|[-+]?\d+', row)
                    if elements:
                        excel_rows.append("\t".join(elements))
                
                excel_table = "\n".join(excel_rows)
                output_lines.append(f"{var_name}\n{excel_table}\n")
                count += 1

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("\n".join(output_lines))

        messagebox.showinfo("Succès", f"Extraction terminée !\n{count} tableau(x) exporté(s) avec succès.")

    except Exception as e:
        messagebox.showerror("Erreur lors du traitement", f"Une erreur est survenue :\n{str(e)}")


# --- INTERFACE GRAPHIQUE (Tkinter) ---

class MatlabExtractorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Extracteur de Tableaux MATLAB")
        self.root.geometry("600x230")  # Fenêtre plus compacte
        self.root.resizable(False, False)
        
        # Variables Tkinter
        self.m_file_path = tk.StringVar()
        self.output_file_path = tk.StringVar()
        
        # Style
        style = ttk.Style()
        style.theme_use('clam')
        
        # --- Section Fichier Source M ---
        ttk.Label(root, text="Fichier MATLAB (.m) :", font=('Helvetica', 10, 'bold')).grid(row=0, column=0, sticky='w', padx=15, pady=(20, 2))
        self.entry_m = ttk.Entry(root, textvariable=self.m_file_path, width=55)
        self.entry_m.grid(row=1, column=0, padx=(15, 5), pady=5)
        ttk.Button(root, text="Parcourir...", command=self.browse_m_file).grid(row=1, column=1, padx=(0, 15), pady=5)

        # --- Section Fichier Sortie TXT ---
        ttk.Label(root, text="Fichier de sortie (.txt) :", font=('Helvetica', 10, 'bold')).grid(row=2, column=0, sticky='w', padx=15, pady=(10, 2))
        self.entry_out = ttk.Entry(root, textvariable=self.output_file_path, width=55)
        self.entry_out.grid(row=3, column=0, padx=(15, 5), pady=5)
        ttk.Button(root, text="Parcourir...", command=self.browse_output_file).grid(row=3, column=1, padx=(0, 15), pady=5)

        # --- Bouton d'action principal ---
        self.btn_run = ttk.Button(root, text="GÉNÉRER LE FICHIER EXCEL-READY", command=self.run_extraction)
        self.btn_run.grid(row=4, column=0, columnspan=2, padx=15, pady=25, ipadx=20, ipady=5)

    def browse_m_file(self):
        filename = filedialog.askopenfilename(
            title="Sélectionner le fichier MATLAB",
            filetypes=[("Fichiers MATLAB", "*.m"), ("Tous les fichiers", "*.*")]
        )
        if filename:
            self.m_file_path.set(filename)
            # Suggérer automatiquement un fichier de sortie au même endroit
            default_out = os.path.splitext(filename)[0] + "_export_excel.txt"
            self.output_file_path.set(default_out)

    def browse_output_file(self):
        filename = filedialog.asksaveasfilename(
            title="Enregistrer le fichier texte",
            defaultextension=".txt",
            filetypes=[("Fichier texte", "*.txt"), ("Tous les fichiers", "*.*")]
        )
        if filename:
            self.output_file_path.set(filename)

    def run_extraction(self):
        process_extraction(
            self.m_file_path.get(),
            self.output_file_path.get()
        )

if __name__ == "__main__":
    root = tk.Tk()
    app = MatlabExtractorApp(root)
    root.mainloop()