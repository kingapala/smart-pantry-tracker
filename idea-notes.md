# Smart Pantry Tracker - MVP

### Główny problem
Użytkownicy nie mają realnej kontroli nad stanem swojej kuchni, co prowadzi do dwóch negatywnych skutków: marnowania żywności (przeterminowane produkty) oraz konieczności częstych, nieplanowanych wizyt w sklepie po zapomniane składniki.

### Najmniejszy zestaw funkcjonalności (MVP)
    - Logowanie: System autentykacji (e-mail/hasło lub Social Login) zapewniający izolację danych użytkownika.
    - Zarządzanie zapasami: CRUD produktów (nazwa, ilość, jednostka, data ważności). Jeżeli produkt jest po terminie ma zostać zaznaczony na czerwono i użytkownik ma mieć możliwość usunięcia jego.
    - Automatyczna lista zakupów: Silnik decyzyjny, który automatycznie dodaje produkt do listy zakupów, gdy jego ilość spadnie poniżej ustalonego minimum (current_stock < min_threshold).
    - Wizualizacja listy: Czytelny widok listy zakupów z możliwością "odhaczania" produktów po zakupie (co automatycznie aktualizuje stan w magazynie).
    - Integracja z przepisami online: Sugerowanie posiłków na podstawie stanu lodówki.
### Co NIE wchodzi w zakres MVP
    - Skanowanie paragonów przez OCR: Ręczne wprowadzanie jest wystarczające na start.
    - Udostępnianie lodówki (współdzielenie): Funkcja "domownicy" to zbyt duży narzut na MVP.
    - Własne powiadomienia Push/Email: Ograniczamy się do widoku aplikacji (brak powiadomień zewnętrznych).
    - Aplikacja mobilna: Skupiamy się na wersji webowej (RWD).
### Kryteria sukcesu
    - Efektywność: Użytkownik jest w stanie dodać 5 produktów do systemu i sprawdzić stan listy zakupów w mniej niż 60 sekund.
    - Weryfikacja logiki: 100% produktów, których ilość zostanie manualnie ustawiona na 0 lub poniżej minimum w bazie danych, jest poprawnie widocznych na liście zakupów.
    - Testowanie: Kluczowy przepływ ("Zużycie produktu -> Automatyczna aktualizacja listy zakupów") jest zabezpieczony testem E2E, który przechodzi w pipeline CI/CD na każdym deployu.