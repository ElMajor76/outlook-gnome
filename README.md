# Outlook GNOME

Client Outlook multi-comptes, sous forme d'application autonome (Electron) intégrée à GNOME/Fedora : notifications natives (libnotify), icône dans le tray, header bar façon Adwaita, support des boîtes partagées en accès délégué.

Ce n'est pas un client mail réimplémenté : chaque compte ouvre une session isolée de la vraie interface web d'Outlook (`outlook.office.com` / `outlook.live.com`), avec son propre login et ses propres cookies.

## Prérequis

- Fedora avec GNOME Shell (Wayland)
- Node.js 20+ et npm
- L'extension GNOME **AppIndicator and KStatusNotifierItem Support**, pour que l'icône du tray s'affiche :

  ```bash
  sudo dnf install gnome-shell-extension-appindicator
  gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
  ```

  (une reconnexion à la session peut être nécessaire si l'extension vient d'être installée)

## Installation

```bash
git clone https://github.com/ElMajor76/outlook-gnome.git
cd outlook-gnome
npm install
```

## Lancement

```bash
npm start
```

ou directement :

```bash
./start.sh
```

À la première ouverture, aucun compte n'est configuré : clique sur le bouton **☰** dans la barre du haut, puis **Ajouter un compte…**.

### Types de comptes

- **Microsoft 365 / entreprise** ou **Outlook.com / personnel** : ouvre une session isolée dédiée, connexion Microsoft classique.
- **Boîte partagée (accès délégué)** : réutilise la session d'un compte déjà configuré pour ouvrir directement la boîte partagée (`outlook.office.com/mail/<adresse>/`), sans identifiants séparés. Nécessite un accès délégué déjà accordé sur cette boîte par un administrateur.

### Notifications

Les notifications de bureau natives ne fonctionnent que si elles sont activées **dans les réglages d'Outlook lui-même**, pour chaque compte : ⚙️ Paramètres → Général → Notifications → *Notification de bureau*. L'application ne fait qu'intercepter et relayer les notifications qu'Outlook déclenche.

Une entrée **Notification de test** dans le menu du tray permet de vérifier indépendamment que le pipeline de notifications natives (Electron → libnotify → GNOME Shell) fonctionne.

## Démarrage automatique

Activable depuis le menu **☰ → Démarrage automatique**. Crée un fichier `~/.config/autostart/outlook-gnome.desktop` qui lance l'app en arrière-plan (dans le tray) à l'ouverture de session.

## Lanceur dans le tiroir d'applications

Un fichier `.desktop` peut être installé pour que l'app apparaisse dans le tiroir d'applications GNOME :

```bash
mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/outlook-gnome.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Outlook
Comment=Client Outlook multi-comptes (wrapper Electron)
Exec=$(pwd)/start.sh
Icon=$(pwd)/assets/icon-app-v2.png
Terminal=false
Categories=Network;Email;
StartupWMClass=outlook-gnome
EOF
update-desktop-database ~/.local/share/applications
```

## Structure du projet

```
main.js                    process principal Electron (fenêtres, comptes, notifications, tray)
mailPreload.js              préchargement injecté dans chaque vue Outlook (pont de notifications)
shell/                      interface de la fenêtre principale (header bar, menu) et du dialogue d'ajout de compte
assets/                     icônes de l'application
```

## Licence

MIT — voir [LICENSE](LICENSE).
