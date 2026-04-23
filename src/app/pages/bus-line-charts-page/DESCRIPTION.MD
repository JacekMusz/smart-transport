# Bus Line Charts Page – Opis i Wymagania Funkcjonalne

## Co przedstawia wykres

Strona wyświetla **niciogram** (string diagram / time-space diagram) harmonogramu przejazdów dla wybranej linii autobusowej.

### Układ wykresu

```
↑ Pętla 2
|   (kierunek 2 – prawa oś Y)
|  /\   /\   /\
| /  \ /  \ /  \
|/    X    X    \
|\   / \  / \   /
| \ /   \/   \ /
|  V    V     V
↓ Pętla 1
(kierunek 1 – lewa oś Y)
────────────────────────────→ Czas (oś X)
```

- **Oś X (pozioma, na dole):** czas w formacie `HH:MM`
- **Oś Y lewa:** przystanki **kierunku 1** — Pętla 1 na dole, Pętla 2 na górze
- **Oś Y prawa:** przystanki **kierunku 2** — Pętla 2 na górze, Pętla 1 na dole
- Obie osie Y korzystają z **tej samej skali numerycznej** (metry od Pętli 1), dzięki czemu linie pojazdów przecinają się prawidłowo
- Każdy **pojazd** jest reprezentowany przez inny kolor linii
- Przejazd „tam" (Pętla 1 → Pętla 2): linia biegnie od dołu do góry
- Przejazd powrotny (Pętla 2 → Pętla 1): linia biegnie od góry do dołu
- Odcinki poziome na pętlach łączą koniec poprzedniego przejazdu z początkiem następnego — wizualizują **czas postoju na pętli**

---

## Wymagania funkcjonalne

### Dane wejściowe

- Dane trasy pobierane z `localStorage` pod kluczem `smart-transport-data` (lista tras i przystanków)
- Harmonogram pojazów pobierany z `localStorage` pod kluczem `schedule-line-{id}`

### Kierunki

- Trasa linii dzielona jest automatycznie na **dwa kierunki** na podstawie przystanków oznaczonych jako `busLoop: true`
- Pierwszy przystanek pętlowy = Pętla 1 (start)
- Drugi odrębny przystanek pętlowy = Pętla 2 (punkt zwrotny)
- Jeśli brak dwóch odrębnych pętli, wyświetlany jest jeden kierunek

### Pozycja przystanków na osi Y

- Wyznaczana na podstawie **rzeczywistej odległości geograficznej** (algorytm haversine) wzdłuż trasy od Pętli 1
- Przystanki kierunku 1: Y = odległość od Pętli 1 (0 .. maxY)
- Przystanki kierunku 2: Y = `maxY − (odległość_od_Pętli2_z_powrotem)`, tak aby obie pętle były na tych samych poziomach niezależnie od geografii

### Oś Y

- **Lewa oś:** etykiety przystanków kierunku 1 przy odpowiadających im wartościach Y
- **Prawa oś:** etykiety przystanków kierunku 2 przy odpowiadających im wartościach Y
- Marginesy ±5% `maxY` od góry i dołu, aby skrajne punkty (pętle) nie były przycinane
- Poziome linie siatki dla obu osi

### Oś X

- Skala liniowa w minutach bezwzględnych (`HH * 60 + MM`)
- Etykiety co 30 minut w formacie `HH:MM`
- Zakres automatycznie dopasowany do danych ±15 minut marginesu

### Linie pojazdów

- Każdy pojazd = osobny dataset w unikalnym kolorze (złoty kąt HSL dla dobrego rozróżnienia)
- Wszystkie przejazdy pojazdu połączone w **jedną ciągłą linię** — brak przerw między przejazdami
- Odcinek poziomy na pętli = czas postoju/przerwy między kursami
- Tooltip po najechaniu pokazuje: `{nazwa pojazdu}: {nazwa przystanku} o {HH:MM}`

### Stany widoku

- **Stan ładowania:** spinner podczas pobierania danych
- **Stan „nie znaleziono":** komunikat gdy brak linii o danym ID
- **Stan pusty:** komunikat gdy brak harmonogramu, z przyciskiem powrotu do szczegółów linii
- **Wykres:** wyświetlany gdy istnieje co najmniej jeden pojazd z przejazdami

### Nawigacja

- Przycisk „← Powrót" przenosi do strony `bus-line-detail-page` dla tej samej linii
- ID linii pobierane z parametru `:id` w URL (route param)

### Zarządzanie zasobami

- Instancja `Chart.js` niszczona przy `ngOnDestroy` (brak wycieków pamięci)
- Przy ponownym renderowaniu wykresu poprzednia instancja jest niszczona przed utworzeniem nowej
