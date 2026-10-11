#!/usr/bin/env python3
"""Trip statistics for leapmotor-mate-card, from Leapmotor Mate's trip export.

Usage (Home Assistant command_line sensor, see the README):
    python3 leapmotor_stats.py [MATE_URL] [TIME_ZONE]
MATE_URL defaults to http://localhost:4000 ; TIME_ZONE to Europe/Paris.
Inside Home Assistant OS, MATE_URL is http://<addon-hostname>:4000 where the
add-on hostname is its slug with dashes (Settings -> Add-ons -> Leapmotor Mate).

---
Statistiques de trajets Leapmotor pour la carte leapmotor-mate-card.

Lit l'export CSV des trajets de l'add-on Leapmotor Mate (reseau interne des
add-ons) et ecrit un JSON sur la sortie standard, lu par le capteur
command_line `leapmotor_stats` (configuration.yaml). Les capteurs template de
template.yaml en tirent ce que la section Trajets de la carte attend :
km et energie des 7 derniers jours (avec le detail par jour), consommation
moyenne sur 6 semaines (avec l'historique hebdomadaire), cumuls, et
repartition conduite / climat / autres de la semaine.

Regles :
- trajets fusionnes (merged_into_id) ignores : leur distance est deja dans le
  trajet qui les absorbe ;
- energie par jour = energie de CONDUITE (ec_driving) uniquement, et seulement
  si TOUS les trajets du jour la fournissent ; sinon le jour n'a pas d'energie
  plutot qu'une valeur partielle presentee comme complete ;
- dates en heure locale (Europe/Paris), comme l'affiche la carte.

Sans dependance : bibliotheque standard seulement (execute dans le conteneur HA).
"""
import csv
import io
import json
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000").rstrip("/")
URL = BASE + "/api/export/trips.csv"
TZ = ZoneInfo(sys.argv[2] if len(sys.argv) > 2 else "Europe/Paris")


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> int:
    with urllib.request.urlopen(URL, timeout=20) as resp:
        text = resp.read().decode("utf-8")

    trips = []
    for row in csv.DictReader(io.StringIO(text)):
        if row.get("merged_into_id"):
            continue
        started = row.get("started_at")
        if not started:
            continue
        day = datetime.fromisoformat(started).astimezone(TZ).date()
        trips.append({
            "day": day,
            "km": num(row.get("distance_km")) or 0.0,
            "kwh": num(row.get("energy_kwh")),
            "driving": num(row.get("ec_driving")),
            "climate": num(row.get("ec_ac")),
            "other": num(row.get("ec_other")),
        })

    today = datetime.now(TZ).date()
    week_start = today - timedelta(days=6)
    week = [t for t in trips if t["day"] >= week_start]

    def total(rows, key):
        values = [t[key] for t in rows if t[key] is not None]
        return round(sum(values), 2) if values else None

    # Detail par jour, 7 derniers jours (jours sans trajet compris : 0 km).
    daily = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        rows = [t for t in week if t["day"] == d]
        entry = {"date": d.isoformat(), "mileage_km": round(sum(t["km"] for t in rows), 1)}
        driving = [t["driving"] for t in rows if t["km"] > 0]
        if rows and all(v is not None for v in driving):
            entry["driving_energy_kwh"] = round(sum(driving), 2)
            entry["energy_unit"] = "kWh"
        daily.append(entry)

    # Consommation par semaine (lundi-dimanche), 6 dernieres semaines.
    monday = today - timedelta(days=today.weekday())
    weekly = []
    for w in range(5, -1, -1):
        start = monday - timedelta(weeks=w)
        end = start + timedelta(days=6)
        rows = [t for t in trips if start <= t["day"] <= end]
        km = sum(t["km"] for t in rows)
        kwh = total(rows, "kwh")
        weekly.append({
            "weekStart": start.isoformat(),
            "weekEnd": end.isoformat(),
            "hundredKmEC": round(kwh / km * 100, 1) if km > 0 and kwh else None,
        })

    six_weeks = [t for t in trips if t["day"] >= today - timedelta(days=41)]
    km6 = sum(t["km"] for t in six_weeks)
    kwh6 = total(six_weeks, "kwh")

    parts = {k: total(week, k) for k in ("driving", "climate", "other")}
    known = [v for v in parts.values() if v is not None]
    parts_sum = sum(known) if known else 0
    pct = {k: (round(v / parts_sum * 100, 1) if v is not None and parts_sum > 0 else None) for k, v in parts.items()}

    first_day = min((t["day"] for t in trips), default=None)
    out = {
        "last7_km": round(sum(t["km"] for t in week), 1),
        "last7_energy_kwh": total(week, "kwh"),
        "avg_6w_kwh_100km": round(kwh6 / km6 * 100, 1) if km6 > 0 and kwh6 else None,
        "total_km": round(sum(t["km"] for t in trips), 1),
        "total_energy_kwh": total(trips, "kwh"),
        "week_driving_kwh": parts["driving"],
        "week_climate_kwh": parts["climate"],
        "week_other_kwh": parts["other"],
        "week_driving_pct": pct["driving"],
        "week_climate_pct": pct["climate"],
        "week_other_pct": pct["other"],
        "daily_detail": daily,
        "weekly_consumption": weekly,
        "trips": len(trips),
        "since": first_day.isoformat() if first_day else None,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
