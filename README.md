# Outlook GNOME

Client Outlook multi-comptes, sous forme d'application autonome (Electron) intégrée à GNOME/Fedora : notifications natives (libnotify), icône dans le tray, header bar façon Adwaita, support des boîtes partagées en accès délégué.

Ce n'est pas un client mail réimplémenté : chaque compte ouvre une session isolée de la vraie interface web d'Outlook (`outlook.office.com` / `outlook.live.com`), avec son propre login et ses propres cookies.

## Installation

### Depuis un paquet (recommandé)

Télécharge le paquet correspondant à ta distribution depuis la page **[Releases](https://github.com/ElMajor76/outlook-gnome/releases/latest)** :

- **AppImage** (universel, aucune installation système) :

  ```bash
  chmod +x "Outlook GNOME-*.AppImage"
  ./"Outlook GNOME-*.AppImage"
  ```

- **.deb** (Ubuntu/Debian) :

  ```bash
  sudo apt install ./outlook-gnome_*_amd64.deb
  ```

- **.rpm** (Fedora/RHEL/openSUSE) :

  ```bash
  sudo dnf install ./outlook-gnome-*.x86_64.rpm
  ```

Les paquets `.deb` et `.rpm` enregistrent automatiquement l'icône, le lanceur dans le tiroir d'applications GNOME et le binaire (`outlook-gnome`) dans le `PATH`. L'AppImage est portable et ne nécessite aucune installation.

### Depuis les sources (développement)

```bash
git clone https://github.com/ElMajor76/outlook-gnome.git
cd outlook-gnome
npm install
npm start
```

## Prérequis

- Fedora avec GNOME Shell (Wayland) — d'autres distributions GNOME devraient fonctionner de façon similaire
- L'extension GNOME **AppIndicator and KStatusNotifierItem Support**, pour que l'icône du tray s'affiche :

  ```bash
  sudo dnf install gnome-shell-extension-appindicator
  gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
  ```

  (une reconnexion à la session peut être nécessaire si l'extension vient d'être installée)

## Utilisation

À la première ouverture, aucun compte n'est configuré : clique sur le bouton **☰** dans la barre du haut, puis **Ajouter un compte…**.

### Types de comptes

- **Microsoft 365 / entreprise** ou **Outlook.com / personnel** : ouvre une session isolée dédiée, connexion Microsoft classique.
- **Boîte partagée (accès délégué)** : ouvre directement la boîte partagée (`outlook.office.com/mail/<adresse>/`) dans sa propre session isolée, en y clonant les cookies d'authentification du compte parent au moment de l'ajout — donc sans nouvelle connexion à faire. Nécessite un accès délégué déjà accordé sur cette boîte par un administrateur. Si la session du compte parent est révoquée ou expire indépendamment, retire puis réajoute la boîte partagée pour re-cloner des cookies frais.

### Notifications

Les notifications de bureau natives ne fonctionnent que si elles sont activées **dans les réglages d'Outlook lui-même**, pour chaque compte : ⚙️ Paramètres → Général → Notifications → *Notification de bureau*. L'application ne fait qu'intercepter et relayer les notifications qu'Outlook déclenche.

Une entrée **Notification de test** dans le menu du tray permet de vérifier indépendamment que le pipeline de notifications natives (Electron → libnotify → GNOME Shell) fonctionne.

### Démarrage automatique

Activable depuis le menu **☰ → Démarrage automatique**. Crée un fichier `~/.config/autostart/outlook-gnome.desktop` qui lance l'app en arrière-plan (dans le tray) à l'ouverture de session.

## Limitations connues

- **Apparence des boîtes partagées** : le thème (clair/sombre) et la couleur d'accentuation choisis dans Outlook en consultant une boîte partagée en accès délégué ne sont pas conservés après redémarrage — Outlook semble appliquer les réglages d'apparence de l'identité connectée (le compte parent) plutôt que de la boîte consultée. Ce comportement est identique dans un navigateur classique ; ce n'est pas une limitation de cette application.
- Le format de titre `(N) ...` utilisé pour détecter le nombre de mails non lus peut changer si Microsoft fait évoluer l'interface d'Outlook, ce qui casserait les badges de compteur (les notifications elles-mêmes ne seraient pas affectées).

## Empaqueter soi-même

Les paquets sont générés avec [electron-builder](https://www.electron.build/). Nécessite `rpm-build`, `dpkg` et `fakeroot` sur Fedora :

```bash
sudo dnf install rpm-build dpkg fakeroot
npm run dist            # AppImage + .deb + .rpm
npm run dist:appimage
npm run dist:deb
npm run dist:rpm
```

Les fichiers générés se trouvent dans `dist/`.

## Structure du projet

```
main.js                     process principal Electron (fenêtres, comptes, notifications, tray, empaquetage)
mailPreload.js               préchargement injecté dans chaque vue Outlook (pont de notifications)
shell/                       interface de la fenêtre principale (header bar, menu) et du dialogue d'ajout de compte
assets/                      icônes de l'application
```

## Licence

MIT — voir [LICENSE](LICENSE).
