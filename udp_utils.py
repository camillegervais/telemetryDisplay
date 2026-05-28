import socket
import struct

# Configuration réseau (Mêmes paramètres que dans Simulink)
UDP_IP = "127.0.0.1"
UDP_PORT = 25000

# Création et liaison du Socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

# Définition du format de décodage (Exemple pour 4 'doubles' Simulink)
# '>' = Big-endian (format réseau standard utilisé par Simulink UDP)
# 'd' = double (float 64-bit). 'dddd' signifie qu'on attend 4 doubles.
FORMAT_CORRESPONDANCE = "<dddd" 
TAILLE_PAQUET = struct.calcsize(FORMAT_CORRESPONDANCE) # Équivaut à 4 * 8 = 32 octets

print(f"Télémétrie en ligne. Écoute sur le port {UDP_PORT}...")

try:
    while True:
        # On attend de recevoir les octets bruts
        data, addr = sock.recvfrom(1024)
        
        # Sécurité : on vérifie que le paquet reçu a bien la taille attendue
        if len(data) == TAILLE_PAQUET:
            # Décodage magique des bytes en tuple Python
            signaux_decodes = struct.unpack(FORMAT_CORRESPONDANCE, data)
            
            print(f"Reçu de {addr} : {signaux_decodes}")
        else:
            print(f"Paquet corrompu ou incomplet reçu (Taille : {len(data)} octets)")

except KeyboardInterrupt:
    print("\nArrêt de la télémétrie.")
finally:
    sock.close()