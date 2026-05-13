# Pour lib, la commande est : pip install pygetwindow screeninfo

import pygetwindow as gw
from screeninfo import get_monitors

def positionner_fenetre(nom_fenetre, num_ecran, rel_x, rel_y, rel_largeur, rel_hauteur):
    """
    Place une fenêtre en utilisant des coordonnées proportionnelles à un écran spécifique.
    
    :param nom_fenetre: Titre (partiel) de la fenêtre
    :param num_ecran: Index de l'écran (0 pour le premier, 1 pour le second, etc.)
    :param rel_x: Position X relative (0.0 à 1.0)
    :param rel_y: Position Y relative (0.0 à 1.0)
    :param rel_largeur: Largeur relative (0.0 à 1.0)
    :param rel_hauteur: Hauteur relative (0.0 à 1.0)
    """
    
    # 1. Récupérer les infos des moniteurs
    moniteurs = get_monitors()
    if num_ecran >= len(moniteurs):
        print(f"Erreur : L'écran {num_ecran} n'existe pas.")
        return

    m = moniteurs[num_ecran]
    
    # 2. Calculer les positions réelles en pixels
    abs_x = m.x + int(m.width * rel_x)
    abs_y = m.y + int(m.height * rel_y)
    abs_w = int(m.width * rel_largeur)
    abs_h = int(m.height * rel_hauteur)

    # 3. Trouver et déplacer la fenêtre
    fenetres = gw.getWindowsWithTitle(nom_fenetre)
    if fenetres:
        f = fenetres[0]
        if f.isMinimized:
            f.restore()
        
        f.restore() 
        
        f.moveTo(abs_x, abs_y)
        f.resizeTo(abs_w, abs_h)
        f.activate()
        print(f"'{nom_fenetre}' placé sur l'écran {num_ecran} en {abs_x},{abs_y}")
    else:
        print(f"Fenêtre '{nom_fenetre}' introuvable.")

positionner_fenetre("Bloc-notes", num_ecran=1, rel_x=0, rel_y=0, rel_largeur=0.5, rel_hauteur=1.0) # Numéro d'écran commence par 0