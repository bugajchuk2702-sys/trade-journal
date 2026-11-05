# Торговый журнал (офлайн PWA)

Запуск:
    npm install
    npm run dev        # разработка: http://localhost:5173
    npm run build      # сборка в dist/
    npm run preview    # проверить собранную версию (PWA работает только из build)

Данные хранятся локально в IndexedDB (Dexie). Каждая запись уже имеет id, updatedAt,
deleted и synced — это основа для облачной синхронизации (следующий шаг, Supabase).
Пока есть экспорт/импорт JSON как ручная резервная копия.
