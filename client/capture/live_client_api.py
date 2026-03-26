
import requests
import urllib3
from typing import Dict, List, Optional

# The Live Client API uses a self-signed cert
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://127.0.0.1:2999"


class LiveClientAPI:

    def is_available(self) -> bool:
        try:
            r = requests.get(f"{BASE_URL}/liveclientdata/gamestats", verify=False, timeout=2)
            return r.status_code == 200
        except Exception:
            return False

    def get_game_time(self) -> Optional[float]:
        try:
            r = requests.get(f"{BASE_URL}/liveclientdata/gamestats", verify=False, timeout=2)
            if r.ok:
                return r.json().get("gameTime", 0.0)
        except Exception:
            pass
        return None

    def get_player_list(self) -> Optional[List[Dict]]:
        try:
            r = requests.get(f"{BASE_URL}/liveclientdata/playerlist", verify=False, timeout=2)
            if r.ok:
                return r.json()
        except Exception:
            pass
        return None

    def get_active_player_name(self) -> Optional[str]:
        try:
            r = requests.get(f"{BASE_URL}/liveclientdata/activeplayer", verify=False, timeout=2)
            if r.ok:
                return r.json().get("summonerName")
        except Exception:
            pass
        return None

    def get_roster(self) -> Optional[Dict]:
        players = self.get_player_list()
        if not players:
            return None

        active_name = self.get_active_player_name()
        if not active_name:
            # Active player hasn't loaded fully yet. Keep polling.
            return None

        roster = {"blue": [], "red": []}
        local_champ = None
        local_team = None

        for p in players:
            champ = p.get("championName", "Unknown")
            team_raw = p.get("team", "")
            summoner = p.get("summonerName", "")

            # ORDER = blue, CHAOS = red
            team = "blue" if team_raw == "ORDER" else "red"
            roster[team].append(champ)

            if summoner == active_name:
                local_champ = champ
                local_team = team

        return {
            "roster": {"blue": roster["blue"], "red": roster["red"]},
            "local_player_champ": local_champ,
            "local_player_team": local_team,
        }

    def get_alive_status(self) -> Optional[Dict[str, bool]]:
        players = self.get_player_list()
        if not players:
            return None
        return {
            p["championName"]: not p.get("isDead", False)
            for p in players
        }


if __name__ == "__main__":
    print("Testing Live Client Data API...")
    api = LiveClientAPI()
    
    if api.is_available():
        print("API is available!")
        print(f"Game time: {api.get_game_time():.1f}s")
        print(f"Active player: {api.get_active_player_name()}")
        
        roster = api.get_roster()
        if roster:
            print(f"Blue: {', '.join(roster['roster']['blue'])}")
            print(f"Red:  {', '.join(roster['roster']['red'])}")
            print(f"You: {roster['local_player_champ']} ({roster['local_player_team']})")
        
        alive = api.get_alive_status()
        if alive:
            print(f"Alive status: {alive}")
    else:
        print("API not available (no active game)")
