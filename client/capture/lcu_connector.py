"""
lcu_connector.py
----------------
Connects to the local League of Legends Client Update (LCU) API.
Extracts the currently locked-in champions during Champ Select,
and identifies which champion the local player picked.
"""

import json
import os
import time
import urllib3
import requests
from typing import Dict, List, Optional, Tuple

# Disable SSL warnings since the LCU uses a self-signed local certificate
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LCU_LOCKFILE_PATH = r"C:\Riot Games\League of Legends\lockfile"

# We will fetch DataDragon champion data to map numeric IDs to Champion Names
# DDragon version can be fetched dynamically, but hardcoding a recent one works as a fallback
DDRAGON_VERSION = "14.4.1" 
DDRAGON_URL = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VERSION}/data/en_US/champion.json"


class LCUConnector:
    def __init__(self, lockfile_path: str = LCU_LOCKFILE_PATH):
        self.lockfile_path = lockfile_path
        self._port = None
        self._password = None
        self._protocol = None
        self._auth_headers = {}
        
        self.champ_id_to_name = {}
        self._load_champ_mapping()

    def _load_champ_mapping(self):
        """Fetches Riot's Data Dragon to map numeric champion IDs to string names (e.g., 222 -> 'Jinx')."""
        print("[LCU] Fetching Data Dragon champion mapping...")
        try:
            # First, try to get the very latest version
            versions_resp = requests.get("https://ddragon.leagueoflegends.com/api/versions.json", timeout=5)
            if versions_resp.ok:
                version = versions_resp.json()[0]
            else:
                version = DDRAGON_VERSION

            resp = requests.get(f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json", timeout=10)
            if resp.ok:
                data = resp.json()["data"]
                for champ_name, champ_data in data.items():
                    numeric_id = int(champ_data["key"])
                    self.champ_id_to_name[numeric_id] = champ_name
                print(f"[LCU] Loaded {len(self.champ_id_to_name)} champions from DDragon (v{version}).")
            else:
                print(f"[LCU] WARNING: Failed to fetch Data Dragon mapping. Status: {resp.status_code}")
        except Exception as e:
            print(f"[LCU] Error loading champ mapping: {e}")

    def connect(self) -> bool:
        """Reads the lockfile to get connection credentials."""
        if not os.path.exists(self.lockfile_path):
            print(f"[LCU] Lockfile not found at {self.lockfile_path}. Is League Client running?")
            return False

        try:
            with open(self.lockfile_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                # Format: LeagueClient:12345:54321:password:https
                parts = content.split(":")
                if len(parts) >= 5:
                    self._port = parts[2]
                    self._password = parts[3]
                    self._protocol = parts[4]
                    
                    import base64
                    auth_str = f"riot:{self._password}"
                    b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
                    self._auth_headers = {
                        "Authorization": f"Basic {b64_auth}",
                        "Accept": "application/json"
                    }
                    print(f"[LCU] Connected to League Client on port {self._port}.")
                    return True
        except Exception as e:
            print(f"[LCU] Error parsing lockfile: {e}")
        
        return False

    def request(self, endpoint: str) -> Optional[Dict]:
        """Makes an authenticated GET request to the LCU API."""
        if not self._port:
            return None
            
        url = f"{self._protocol}://127.0.0.1:{self._port}{endpoint}"
        try:
            response = requests.get(url, headers=self._auth_headers, verify=False, timeout=3)
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                # Endpoint not available (e.g., not in champ select)
                return None
            else:
                print(f"[LCU] Request to {endpoint} returned {response.status_code}")
                return None
        except Exception as e:
            print(f"[LCU] Request error: {e}")
            return None

    def get_champ_select_info(self) -> Optional[Dict]:
        """
        Fetches the current Champ Select session.
        Returns a dict:
        {
           "roster": {"blue": ["Jinx", ...], "red": ["Annie", ...]},
           "local_player_champ": "Jinx",
           "local_player_team": "blue",
           "is_locked_in": True/False
        }
        """
        session = self.request("/lol-champ-select/v1/session")
        if not session:
            return None

        local_cell_id = session.get("localPlayerCellId")
        my_team = session.get("myTeam", [])
        their_team = session.get("theirTeam", [])

        roster = {"blue": [], "red": []}
        local_champ = None
        local_team = None

        # Determine absolute teams using teamId (100 = blue, 200 = red)
        for player in my_team:
            champ_id = player.get("championId", 0)
            cell_id = player.get("cellId")
            team_id = player.get("teamId", 100) # Fallback to 100
            
            # Map 100 -> blue, 200 -> red
            team_key = "blue" if team_id == 100 else "red"
            
            champ_name = self.champ_id_to_name.get(champ_id, "Unknown")
            if champ_id > 0:
                roster[team_key].append(champ_name)
            else:
                roster[team_key].append("None")
                
            if cell_id == local_cell_id:
                local_champ = champ_name
                local_team = team_key

        for player in their_team:
            champ_id = player.get("championId", 0)
            team_id = player.get("teamId", 200) # Fallback to 200
            team_key = "blue" if team_id == 100 else "red"
            
            champ_name = self.champ_id_to_name.get(champ_id, "Unknown")
            if champ_id > 0:
                roster[team_key].append(champ_name)
            else:
                roster[team_key].append("None")
                
        return {
            "roster": {"blue": roster["blue"], "red": roster["red"]},
            "local_player_champ": local_champ,
            "local_player_team": local_team,
            "is_locked_in": local_champ != "None"
        }

    def get_gameflow_phase(self) -> Optional[str]:
        """
        Returns the current game flow phase string from the LCU API.
        Common values:
          - 'None'        : Client idle
          - 'Lobby'       : In a lobby
          - 'Matchmaking'  : Queue search
          - 'ReadyCheck'  : Accept/Decline popup
          - 'ChampSelect' : Champion Select screen
          - 'GameStart'   : Loading screen has started
          - 'InProgress'  : Game is actively running
          - 'EndOfGame'   : Post-game screen
        Returns None if the request fails.
        """
        result = self.request("/lol-gameflow/v1/gameflow-phase")
        # This endpoint returns a plain string (with quotes), not a JSON object
        if result is not None:
            if isinstance(result, str):
                return result
            return str(result)
        return None

if __name__ == "__main__":
    # Test script run
    print("Testing LCU Connector...")
    connector = LCUConnector()
    if connector.connect():
        print("Connected! Polling champ select...")
        while True:
            info = connector.get_champ_select_info()
            if info:
                print("\n=== Active Champ Select ===")
                print(f"Local Player: {info['local_player_champ']} ({info['local_player_team']})")
                print(f"Blue Team: {', '.join(info['roster']['blue'])}")
                print(f"Red Team:  {', '.join(info['roster']['red'])}")
            else:
                print("Not in Champ Select.")
            time.sleep(2)
    else:
        print("Could not connect to League Client. Please launch the game first.")
