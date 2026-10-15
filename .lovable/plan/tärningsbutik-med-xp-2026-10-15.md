# Tärningsbutik med XP

## Vad spelaren får
- Knappen **Dina tärningar** på startsidan byter namn till **Tärningsbutik** och visar spelarens XP (t.ex. ⭐ 12).
- Varje frivillig annons som tittas klart ger **1 XP**, högst **10 XP per dag**. Efter annonsen syns en kort ruta: "+1 XP · Du har 12 XP" (eller "Dagens max är nått").
- Butiken visar överst nivån (brons/silver/guld/platina, som i dag) och XP-saldot, under det alla designer med pris.
- Tryck på en design: förhandsvisning, sedan **Köp** (om XP räcker) eller **Använd** (om den redan ägs). "Nästa tärning: 3 XP kvar" visas som mål.
- Valet **Vanliga tärningar** går alltid att välja tillbaka. Motståndare ser den valda designen online.
- Nivåerna finns kvar och tjänas som förut genom att spela.

## Designer (start: ca 30, utbyggbart till 100)
| Sort | Pris |
| --- | --- |
| Enkla färger | 5–10 XP |
| Mönster | 20–40 XP |
| De finaste | 75–100 XP |

Designerna görs som färger och mönster på de befintliga tärningarna, så appen blir inte tyngre. Fler kan läggas till senare utan stora ändringar.

## Regler
- XP och köp sparas på servern, inte i telefonen: inget fusk, inget försvinner vid ominstallation.
- XP ges bara när annonsen visats klart. Misslyckad eller avbruten annons ger inget.
- Ett köp kan inte göras två gånger och drar exakt priset.

## Tekniska detaljer
- Nya tabeller: XP-saldo per spelare, köpta designer, vald design. Alla låsta för direkt åtkomst; endast serverfunktioner.
- Serverfunktioner: ge XP efter annons (dagsgräns, kort spärr mellan anrop), köp design, välj design, hämta butik/saldo. Kopplas till spelarens session/enhet som övriga onlineåtgärder.
- Designkatalogen (id, namn, sort, pris, färger/mönster) ligger på servern och i appen; priset kontrolleras alltid på servern.
- Vald design skickas med i befintliga tärningsprofiler så motståndare ser den; "Använd vita tärningar" och nivåfärger fungerar som i dag när ingen design är vald.
- XP-anropet görs i flödet för frivillig reklam när annonsen visats (resultatet "shown").
- Kräver ny appversion för iPhone och Android.

## Inte med nu
- Köp med riktiga pengar.
- XP för vunna matcher eller Yatzy (kan läggas till senare).
