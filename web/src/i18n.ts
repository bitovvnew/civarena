// Dashboard strings and headline templates. Headlines arrive from the engine as key + params,
// so every viewer reads the same world in their own language.

export const LANGS = { en: 'English', ru: 'Русский', es: 'Español', de: 'Deutsch', zh: '中文', ja: '日本語' } as const;
export type Lang = keyof typeof LANGS;

type Dict = Record<string, string>;

const en: Dict = {
  'app.tagline': 'AI civilization arena',
  'mode.live': 'Live', 'mode.replay': 'Replay', 'mode.paused': 'Paused',
  'tick': 'Day', 'year': 'Year',
  'kpi.gdp': 'GDP / day', 'kpi.inflation': 'Inflation / yr', 'kpi.unemployment': 'Unemployment', 'kpi.gini': 'Inequality (Gini)',
  'kpi.money': 'Money supply', 'kpi.population': 'Population',
  'panel.map': 'The world', 'panel.leaderboard': 'Which model is the best capitalist?', 'panel.economy': 'Economy',
  'panel.share': 'Share of total wealth', 'panel.prices': 'Prices', 'panel.network': 'Trade between teams',
  'panel.feed': 'What just happened', 'panel.controls': 'Run the economy',
  'chart.gdp': 'GDP per day', 'chart.cpi': 'Price index (100 = day 0)', 'chart.money': 'Money supply', 'chart.unemployment': 'Unemployment',
  'lb.score': 'Score', 'lb.wealth': 'Wealth', 'lb.gdp': 'GDP', 'lb.alive': 'Alive', 'lb.gini': 'Gini', 'lb.bankrupt': 'Bankrupt',
  'lb.offline': 'offline', 'lb.help': 'Score = 30·wealth share + 30·GDP share + 25·survival + 15·equality (teams normalised).',
  'feed.all': 'All', 'feed.drama': 'Drama', 'feed.empty': 'Quiet so far.',
  'ctl.play': 'Play', 'ctl.pause': 'Pause', 'ctl.speed': 'Speed', 'ctl.tax': 'Income tax', 'ctl.rate': 'Policy rate',
  'ctl.ubi': 'Basic income / day', 'ctl.welfare': 'Welfare', 'ctl.antitrust': 'Antitrust', 'ctl.print': 'Print money',
  'ctl.shocks': 'Shocks', 'ctl.reset': 'New world', 'ctl.readonly': 'Replays are read-only. Scrub the timeline to explore.',
  'ctl.live': 'Back to live', 'ctl.download': 'Download replay', 'ctl.open': 'Open replay', 'ctl.drop': 'Drop a .civ.json file to watch it',
  'shock.drought': 'Drought', 'shock.mine_collapse': 'Mine collapse', 'shock.tech_boom': 'Tech boom', 'shock.plague': 'Plague',
  'shock.gold_rush': 'Gold rush', 'shock.trade_embargo': 'Embargo',
  'good.food': 'food', 'good.wood': 'wood', 'good.ore': 'ore', 'good.tools': 'tools', 'good.luxury': 'luxury',
  'job.farmer': 'farmer', 'job.lumberjack': 'lumberjack', 'job.miner': 'miner', 'job.smith': 'smith', 'job.artisan': 'artisan',
  'map.legend': 'Dot = citizen, colored by team, sized by wealth. Ring = cartel member.',
  'map.hungry': 'hungry', 'map.cartel': 'in a cartel', 'map.loan': 'has a loan', 'map.health': 'health',
  'net.world': 'World', 'net.help': 'Arrows point from seller to buyer, last 50 days.',
  'cartels': 'Cartels', 'shocks': 'Active shocks', 'none': 'none', 'members': 'members', 'floor': 'floor',
  'table.show': 'Table', 'table.hide': 'Chart', 'connecting': 'Connecting to the world...', 'disconnected': 'Disconnected. Retrying...',
  'h.strategy': '{team}: “{text}”',
  'h.tax': 'The government sets income tax to {pct}%',
  'h.rate': 'The central bank sets the policy rate to {pct}%',
  'h.ubi_on': 'Universal basic income: ${amount} per citizen per day', 'h.ubi_off': 'Universal basic income is cancelled',
  'h.antitrust_on': 'Regulators declare war on cartels', 'h.antitrust_off': 'Regulators stand down. Cartels are legal again.',
  'h.print': 'The central bank prints ${amount}: ${each} for every citizen',
  'h.shock.drought': 'Drought! Harvests collapse for {ticks} days', 'h.shock.mine_collapse': 'Mine collapse! Ore output crashes for {ticks} days',
  'h.shock.tech_boom': 'Tech boom! Workshops get far more productive for {ticks} days', 'h.shock.plague': 'Plague sweeps the land for {ticks} days',
  'h.shock.gold_rush': 'Gold rush! Foreign buyers pay a premium for ore for {ticks} days', 'h.shock.trade_embargo': 'Trade embargo: no imports or exports for {ticks} days',
  'h.first_death': 'First death: {name} of {team} starved',
  'h.bankrupt': '{name} of {team} went bankrupt owing ${debt}',
  'h.bank_crisis': 'Bank crisis: loan losses exceed the bank’s capital by ${loss}',
  'h.cartel_form': '{count} {good} producers form a cartel ({teams}). Price floor ${floor}',
  'h.cartel_defect': '{name} of {team} undercut the {good} cartel. It collapsed.',
  'h.cartel_collapse': 'The {good} cartel fell apart',
  'h.cartel_antitrust': 'Regulators break up the {good} cartel and fine its {count} members',
  'h.price_spike': '{good} prices jump {pct}% to ${price}', 'h.price_crash': '{good} prices crash {pct}% to ${price}',
  'h.starvation': 'Famine: {count} citizens starved in 10 days',
  'h.richest': '{name} of {team} ({job}) is now the richest citizen: ${wealth}',
  'h.monopoly': '{team} now controls {pct}% of {good} production',
  'h.baby_boom': 'Baby boom: {count} births in 20 days',
  'h.hyperinflation': 'Hyperinflation: prices rising {pct}% a year',
  'h.year': 'Year {year} ends. GDP ${gdp}/day, population {pop}, inflation {inflation}%',
  'h.custom': '{text}',
};

const ru: Dict = {
  'app.tagline': 'Арена ИИ-цивилизаций',
  'mode.live': 'Онлайн', 'mode.replay': 'Повтор', 'mode.paused': 'Пауза',
  'tick': 'День', 'year': 'Год',
  'kpi.gdp': 'ВВП / день', 'kpi.inflation': 'Инфляция / год', 'kpi.unemployment': 'Безработица', 'kpi.gini': 'Неравенство (Джини)',
  'kpi.money': 'Денежная масса', 'kpi.population': 'Население',
  'panel.map': 'Мир', 'panel.leaderboard': 'Какая модель лучший капиталист?', 'panel.economy': 'Экономика',
  'panel.share': 'Доля всего богатства', 'panel.prices': 'Цены', 'panel.network': 'Торговля между командами',
  'panel.feed': 'Что происходит', 'panel.controls': 'Управляйте экономикой',
  'chart.gdp': 'ВВП в день', 'chart.cpi': 'Индекс цен (100 = день 0)', 'chart.money': 'Денежная масса', 'chart.unemployment': 'Безработица',
  'lb.score': 'Очки', 'lb.wealth': 'Богатство', 'lb.gdp': 'ВВП', 'lb.alive': 'Живы', 'lb.gini': 'Джини', 'lb.bankrupt': 'Банкроты',
  'lb.offline': 'офлайн', 'lb.help': 'Очки = 30·доля богатства + 30·доля ВВП + 25·выживаемость + 15·равенство.',
  'feed.all': 'Все', 'feed.drama': 'Драма', 'feed.empty': 'Пока тихо.',
  'ctl.play': 'Пуск', 'ctl.pause': 'Пауза', 'ctl.speed': 'Скорость', 'ctl.tax': 'Подоходный налог', 'ctl.rate': 'Ключевая ставка',
  'ctl.ubi': 'Базовый доход / день', 'ctl.welfare': 'Соцпомощь', 'ctl.antitrust': 'Антимонопольщики', 'ctl.print': 'Напечатать деньги',
  'ctl.shocks': 'Потрясения', 'ctl.reset': 'Новый мир', 'ctl.readonly': 'Повтор только для просмотра. Двигайте шкалу времени.',
  'ctl.live': 'К эфиру', 'ctl.download': 'Скачать повтор', 'ctl.open': 'Открыть повтор', 'ctl.drop': 'Перетащите файл .civ.json, чтобы посмотреть',
  'shock.drought': 'Засуха', 'shock.mine_collapse': 'Обвал шахт', 'shock.tech_boom': 'Техбум', 'shock.plague': 'Чума',
  'shock.gold_rush': 'Золотая лихорадка', 'shock.trade_embargo': 'Эмбарго',
  'good.food': 'еда', 'good.wood': 'дерево', 'good.ore': 'руда', 'good.tools': 'инструменты', 'good.luxury': 'роскошь',
  'job.farmer': 'фермер', 'job.lumberjack': 'лесоруб', 'job.miner': 'шахтёр', 'job.smith': 'кузнец', 'job.artisan': 'ремесленник',
  'map.legend': 'Точка = житель, цвет = команда, размер = богатство. Кольцо = член картеля.',
  'map.hungry': 'голодает', 'map.cartel': 'в картеле', 'map.loan': 'есть кредит', 'map.health': 'здоровье',
  'net.world': 'Мир', 'net.help': 'Стрелки от продавца к покупателю, последние 50 дней.',
  'cartels': 'Картели', 'shocks': 'Потрясения', 'none': 'нет', 'members': 'участников', 'floor': 'мин. цена',
  'table.show': 'Таблица', 'table.hide': 'График', 'connecting': 'Подключаемся к миру...', 'disconnected': 'Нет связи. Переподключаемся...',
  'h.strategy': '{team}: «{text}»',
  'h.tax': 'Правительство устанавливает подоходный налог {pct}%',
  'h.rate': 'Центробанк устанавливает ставку {pct}%',
  'h.ubi_on': 'Безусловный доход: ${amount} каждому в день', 'h.ubi_off': 'Безусловный доход отменён',
  'h.antitrust_on': 'Регуляторы объявили войну картелям', 'h.antitrust_off': 'Регуляторы отступили. Картели снова законны.',
  'h.print': 'Центробанк напечатал ${amount}: по ${each} каждому жителю',
  'h.shock.drought': 'Засуха! Урожаи рухнули на {ticks} дней', 'h.shock.mine_collapse': 'Обвал шахт! Добыча руды упала на {ticks} дней',
  'h.shock.tech_boom': 'Техбум! Мастерские работают намного эффективнее {ticks} дней', 'h.shock.plague': 'Чума охватила страну на {ticks} дней',
  'h.shock.gold_rush': 'Золотая лихорадка! Иностранцы переплачивают за руду {ticks} дней', 'h.shock.trade_embargo': 'Эмбарго: ни импорта, ни экспорта {ticks} дней',
  'h.first_death': 'Первая смерть: {name} из команды {team} умер от голода',
  'h.bankrupt': '{name} ({team}) обанкротился с долгом ${debt}',
  'h.bank_crisis': 'Банковский кризис: потери по кредитам превысили капитал банка на ${loss}',
  'h.cartel_form': '{count} производителей ({good}) создали картель ({teams}). Мин. цена ${floor}',
  'h.cartel_defect': '{name} ({team}) сбил цену картеля ({good}). Картель рухнул.',
  'h.cartel_collapse': 'Картель ({good}) распался',
  'h.cartel_antitrust': 'Регуляторы разгромили картель ({good}) и оштрафовали {count} участников',
  'h.price_spike': 'Цены ({good}) взлетели на {pct}% до ${price}', 'h.price_crash': 'Цены ({good}) рухнули на {pct}% до ${price}',
  'h.starvation': 'Голод: {count} жителей умерли за 10 дней',
  'h.richest': '{name} ({team}, {job}) теперь самый богатый житель: ${wealth}',
  'h.monopoly': '{team} контролирует {pct}% производства ({good})',
  'h.baby_boom': 'Бэби-бум: {count} рождений за 20 дней',
  'h.hyperinflation': 'Гиперинфляция: цены растут на {pct}% в год',
  'h.year': 'Год {year} закончился. ВВП ${gdp}/день, население {pop}, инфляция {inflation}%',
  'h.custom': '{text}',
};

const es: Dict = {
  'app.tagline': 'Arena de civilizaciones de IA',
  'mode.live': 'En vivo', 'mode.replay': 'Repetición', 'mode.paused': 'Pausa', 'tick': 'Día', 'year': 'Año',
  'kpi.gdp': 'PIB / día', 'kpi.inflation': 'Inflación / año', 'kpi.unemployment': 'Desempleo', 'kpi.gini': 'Desigualdad (Gini)',
  'kpi.money': 'Masa monetaria', 'kpi.population': 'Población',
  'panel.map': 'El mundo', 'panel.leaderboard': '¿Qué modelo es el mejor capitalista?', 'panel.economy': 'Economía',
  'panel.share': 'Parte de la riqueza total', 'panel.prices': 'Precios', 'panel.network': 'Comercio entre equipos',
  'panel.feed': 'Lo que acaba de pasar', 'panel.controls': 'Dirige la economía',
  'chart.gdp': 'PIB por día', 'chart.cpi': 'Índice de precios (100 = día 0)', 'chart.money': 'Masa monetaria', 'chart.unemployment': 'Desempleo',
  'lb.score': 'Puntos', 'lb.wealth': 'Riqueza', 'lb.gdp': 'PIB', 'lb.alive': 'Vivos', 'lb.gini': 'Gini', 'lb.bankrupt': 'Quiebras',
  'lb.offline': 'sin conexión', 'lb.help': 'Puntos = 30·riqueza + 30·PIB + 25·supervivencia + 15·igualdad.',
  'feed.all': 'Todo', 'feed.drama': 'Drama', 'feed.empty': 'Todo tranquilo por ahora.',
  'ctl.play': 'Reproducir', 'ctl.pause': 'Pausa', 'ctl.speed': 'Velocidad', 'ctl.tax': 'Impuesto sobre la renta', 'ctl.rate': 'Tipo de interés',
  'ctl.ubi': 'Renta básica / día', 'ctl.welfare': 'Ayudas', 'ctl.antitrust': 'Antimonopolio', 'ctl.print': 'Imprimir dinero',
  'ctl.shocks': 'Crisis', 'ctl.reset': 'Mundo nuevo', 'ctl.readonly': 'Las repeticiones son de solo lectura. Usa la línea de tiempo.',
  'ctl.live': 'Volver al directo', 'ctl.download': 'Descargar repetición', 'ctl.open': 'Abrir repetición', 'ctl.drop': 'Suelta un archivo .civ.json para verlo',
  'shock.drought': 'Sequía', 'shock.mine_collapse': 'Derrumbe minero', 'shock.tech_boom': 'Boom tecnológico', 'shock.plague': 'Peste',
  'shock.gold_rush': 'Fiebre del oro', 'shock.trade_embargo': 'Embargo',
  'good.food': 'comida', 'good.wood': 'madera', 'good.ore': 'mineral', 'good.tools': 'herramientas', 'good.luxury': 'lujo',
  'job.farmer': 'granjero', 'job.lumberjack': 'leñador', 'job.miner': 'minero', 'job.smith': 'herrero', 'job.artisan': 'artesano',
  'map.legend': 'Punto = ciudadano, color = equipo, tamaño = riqueza. Anillo = miembro de un cártel.',
  'map.hungry': 'hambriento', 'map.cartel': 'en un cártel', 'map.loan': 'tiene préstamo', 'map.health': 'salud',
  'net.world': 'Mundo', 'net.help': 'Flechas del vendedor al comprador, últimos 50 días.',
  'cartels': 'Cárteles', 'shocks': 'Crisis activas', 'none': 'ninguno', 'members': 'miembros', 'floor': 'precio mín.',
  'table.show': 'Tabla', 'table.hide': 'Gráfico', 'connecting': 'Conectando con el mundo...', 'disconnected': 'Desconectado. Reintentando...',
  'h.strategy': '{team}: «{text}»', 'h.tax': 'El gobierno fija el impuesto sobre la renta en {pct}%', 'h.rate': 'El banco central fija el tipo en {pct}%',
  'h.ubi_on': 'Renta básica universal: ${amount} por ciudadano al día', 'h.ubi_off': 'Se cancela la renta básica universal',
  'h.antitrust_on': 'Los reguladores declaran la guerra a los cárteles', 'h.antitrust_off': 'Los reguladores se retiran. Los cárteles vuelven a ser legales.',
  'h.print': 'El banco central imprime ${amount}: ${each} por ciudadano',
  'h.shock.drought': '¡Sequía! Las cosechas se hunden durante {ticks} días', 'h.shock.mine_collapse': '¡Derrumbe minero! La producción de mineral cae durante {ticks} días',
  'h.shock.tech_boom': '¡Boom tecnológico! Los talleres rinden mucho más durante {ticks} días', 'h.shock.plague': 'La peste azota el país durante {ticks} días',
  'h.shock.gold_rush': '¡Fiebre del oro! Compradores extranjeros pagan más por el mineral durante {ticks} días', 'h.shock.trade_embargo': 'Embargo: sin importaciones ni exportaciones durante {ticks} días',
  'h.first_death': 'Primera muerte: {name} de {team} murió de hambre', 'h.bankrupt': '{name} de {team} quebró debiendo ${debt}',
  'h.bank_crisis': 'Crisis bancaria: las pérdidas superan el capital del banco en ${loss}',
  'h.cartel_form': '{count} productores de {good} forman un cártel ({teams}). Precio mínimo ${floor}',
  'h.cartel_defect': '{name} de {team} rompió el cártel de {good}. Se derrumbó.', 'h.cartel_collapse': 'El cártel de {good} se desintegró',
  'h.cartel_antitrust': 'Los reguladores desmantelan el cártel de {good} y multan a sus {count} miembros',
  'h.price_spike': 'El precio de {good} sube {pct}% hasta ${price}', 'h.price_crash': 'El precio de {good} se desploma {pct}% hasta ${price}',
  'h.starvation': 'Hambruna: {count} ciudadanos murieron en 10 días', 'h.richest': '{name} de {team} ({job}) es ahora el más rico: ${wealth}',
  'h.monopoly': '{team} controla ya el {pct}% de la producción de {good}', 'h.baby_boom': 'Baby boom: {count} nacimientos en 20 días',
  'h.hyperinflation': 'Hiperinflación: los precios suben un {pct}% al año', 'h.year': 'Termina el año {year}. PIB ${gdp}/día, población {pop}, inflación {inflation}%',
  'h.custom': '{text}',
};

const de: Dict = {
  'app.tagline': 'KI-Zivilisationsarena',
  'mode.live': 'Live', 'mode.replay': 'Replay', 'mode.paused': 'Pausiert', 'tick': 'Tag', 'year': 'Jahr',
  'kpi.gdp': 'BIP / Tag', 'kpi.inflation': 'Inflation / Jahr', 'kpi.unemployment': 'Arbeitslosigkeit', 'kpi.gini': 'Ungleichheit (Gini)',
  'kpi.money': 'Geldmenge', 'kpi.population': 'Bevölkerung',
  'panel.map': 'Die Welt', 'panel.leaderboard': 'Welches Modell ist der beste Kapitalist?', 'panel.economy': 'Wirtschaft',
  'panel.share': 'Anteil am Gesamtvermögen', 'panel.prices': 'Preise', 'panel.network': 'Handel zwischen Teams',
  'panel.feed': 'Was gerade passiert', 'panel.controls': 'Steuere die Wirtschaft',
  'chart.gdp': 'BIP pro Tag', 'chart.cpi': 'Preisindex (100 = Tag 0)', 'chart.money': 'Geldmenge', 'chart.unemployment': 'Arbeitslosigkeit',
  'lb.score': 'Punkte', 'lb.wealth': 'Vermögen', 'lb.gdp': 'BIP', 'lb.alive': 'Lebend', 'lb.gini': 'Gini', 'lb.bankrupt': 'Pleiten',
  'lb.offline': 'offline', 'lb.help': 'Punkte = 30·Vermögensanteil + 30·BIP-Anteil + 25·Überleben + 15·Gleichheit.',
  'feed.all': 'Alle', 'feed.drama': 'Drama', 'feed.empty': 'Noch ist es ruhig.',
  'ctl.play': 'Start', 'ctl.pause': 'Pause', 'ctl.speed': 'Tempo', 'ctl.tax': 'Einkommensteuer', 'ctl.rate': 'Leitzins',
  'ctl.ubi': 'Grundeinkommen / Tag', 'ctl.welfare': 'Sozialhilfe', 'ctl.antitrust': 'Kartellamt', 'ctl.print': 'Geld drucken',
  'ctl.shocks': 'Schocks', 'ctl.reset': 'Neue Welt', 'ctl.readonly': 'Replays sind schreibgeschützt. Nutze die Zeitleiste.',
  'ctl.live': 'Zurück zu live', 'ctl.download': 'Replay laden', 'ctl.open': 'Replay öffnen', 'ctl.drop': 'Zieh eine .civ.json-Datei hierher',
  'shock.drought': 'Dürre', 'shock.mine_collapse': 'Grubeneinsturz', 'shock.tech_boom': 'Tech-Boom', 'shock.plague': 'Seuche',
  'shock.gold_rush': 'Goldrausch', 'shock.trade_embargo': 'Embargo',
  'good.food': 'Nahrung', 'good.wood': 'Holz', 'good.ore': 'Erz', 'good.tools': 'Werkzeug', 'good.luxury': 'Luxus',
  'job.farmer': 'Bauer', 'job.lumberjack': 'Holzfäller', 'job.miner': 'Bergmann', 'job.smith': 'Schmied', 'job.artisan': 'Kunsthandwerker',
  'map.legend': 'Punkt = Bürger, Farbe = Team, Größe = Vermögen. Ring = Kartellmitglied.',
  'map.hungry': 'hungrig', 'map.cartel': 'im Kartell', 'map.loan': 'hat Kredit', 'map.health': 'Gesundheit',
  'net.world': 'Welt', 'net.help': 'Pfeile vom Verkäufer zum Käufer, letzte 50 Tage.',
  'cartels': 'Kartelle', 'shocks': 'Aktive Schocks', 'none': 'keine', 'members': 'Mitglieder', 'floor': 'Mindestpreis',
  'table.show': 'Tabelle', 'table.hide': 'Diagramm', 'connecting': 'Verbinde mit der Welt...', 'disconnected': 'Getrennt. Neuer Versuch...',
  'h.strategy': '{team}: „{text}“', 'h.tax': 'Die Regierung setzt die Einkommensteuer auf {pct}%', 'h.rate': 'Die Zentralbank setzt den Leitzins auf {pct}%',
  'h.ubi_on': 'Grundeinkommen: ${amount} pro Bürger und Tag', 'h.ubi_off': 'Das Grundeinkommen wird gestrichen',
  'h.antitrust_on': 'Die Aufsicht erklärt den Kartellen den Krieg', 'h.antitrust_off': 'Die Aufsicht zieht sich zurück. Kartelle sind wieder legal.',
  'h.print': 'Die Zentralbank druckt ${amount}: ${each} für jeden Bürger',
  'h.shock.drought': 'Dürre! Die Ernten brechen für {ticks} Tage ein', 'h.shock.mine_collapse': 'Grubeneinsturz! Die Erzförderung bricht für {ticks} Tage ein',
  'h.shock.tech_boom': 'Tech-Boom! Werkstätten sind {ticks} Tage lang viel produktiver', 'h.shock.plague': 'Eine Seuche wütet {ticks} Tage lang',
  'h.shock.gold_rush': 'Goldrausch! Ausländische Käufer zahlen {ticks} Tage lang mehr für Erz', 'h.shock.trade_embargo': 'Embargo: {ticks} Tage keine Importe und Exporte',
  'h.first_death': 'Erster Todesfall: {name} von {team} ist verhungert', 'h.bankrupt': '{name} von {team} ist pleite, Schulden ${debt}',
  'h.bank_crisis': 'Bankenkrise: Kreditverluste übersteigen das Kapital um ${loss}',
  'h.cartel_form': '{count} {good}-Produzenten bilden ein Kartell ({teams}). Mindestpreis ${floor}',
  'h.cartel_defect': '{name} von {team} unterbot das {good}-Kartell. Es brach zusammen.', 'h.cartel_collapse': 'Das {good}-Kartell ist zerfallen',
  'h.cartel_antitrust': 'Die Aufsicht zerschlägt das {good}-Kartell und bestraft {count} Mitglieder',
  'h.price_spike': '{good}-Preise steigen um {pct}% auf ${price}', 'h.price_crash': '{good}-Preise fallen um {pct}% auf ${price}',
  'h.starvation': 'Hungersnot: {count} Bürger in 10 Tagen verhungert', 'h.richest': '{name} von {team} ({job}) ist jetzt am reichsten: ${wealth}',
  'h.monopoly': '{team} kontrolliert jetzt {pct}% der {good}-Produktion', 'h.baby_boom': 'Babyboom: {count} Geburten in 20 Tagen',
  'h.hyperinflation': 'Hyperinflation: Preise steigen um {pct}% im Jahr', 'h.year': 'Jahr {year} endet. BIP ${gdp}/Tag, Bevölkerung {pop}, Inflation {inflation}%',
  'h.custom': '{text}',
};

const zh: Dict = {
  'app.tagline': 'AI 文明竞技场',
  'mode.live': '直播', 'mode.replay': '回放', 'mode.paused': '已暂停', 'tick': '第', 'year': '年',
  'kpi.gdp': 'GDP / 天', 'kpi.inflation': '年通胀率', 'kpi.unemployment': '失业率', 'kpi.gini': '不平等 (基尼)',
  'kpi.money': '货币供应', 'kpi.population': '人口',
  'panel.map': '世界', 'panel.leaderboard': '哪个模型是最强资本家？', 'panel.economy': '经济',
  'panel.share': '财富占比', 'panel.prices': '价格', 'panel.network': '队伍间贸易',
  'panel.feed': '最新动态', 'panel.controls': '掌控经济',
  'chart.gdp': '每日 GDP', 'chart.cpi': '物价指数 (第 0 天 = 100)', 'chart.money': '货币供应', 'chart.unemployment': '失业率',
  'lb.score': '得分', 'lb.wealth': '财富', 'lb.gdp': 'GDP', 'lb.alive': '存活', 'lb.gini': '基尼', 'lb.bankrupt': '破产',
  'lb.offline': '离线', 'lb.help': '得分 = 30·财富占比 + 30·GDP 占比 + 25·存活率 + 15·平等。',
  'feed.all': '全部', 'feed.drama': '大事', 'feed.empty': '暂时风平浪静。',
  'ctl.play': '播放', 'ctl.pause': '暂停', 'ctl.speed': '速度', 'ctl.tax': '所得税', 'ctl.rate': '基准利率',
  'ctl.ubi': '每日基本收入', 'ctl.welfare': '福利', 'ctl.antitrust': '反垄断', 'ctl.print': '印钞',
  'ctl.shocks': '冲击', 'ctl.reset': '新世界', 'ctl.readonly': '回放为只读，拖动时间轴探索。',
  'ctl.live': '回到直播', 'ctl.download': '下载回放', 'ctl.open': '打开回放', 'ctl.drop': '拖入 .civ.json 文件观看',
  'shock.drought': '旱灾', 'shock.mine_collapse': '矿难', 'shock.tech_boom': '科技繁荣', 'shock.plague': '瘟疫',
  'shock.gold_rush': '淘金热', 'shock.trade_embargo': '禁运',
  'good.food': '食物', 'good.wood': '木材', 'good.ore': '矿石', 'good.tools': '工具', 'good.luxury': '奢侈品',
  'job.farmer': '农民', 'job.lumberjack': '伐木工', 'job.miner': '矿工', 'job.smith': '铁匠', 'job.artisan': '工匠',
  'map.legend': '点 = 居民，颜色 = 队伍，大小 = 财富。圆环 = 卡特尔成员。',
  'map.hungry': '饥饿', 'map.cartel': '卡特尔成员', 'map.loan': '有贷款', 'map.health': '健康',
  'net.world': '外国', 'net.help': '箭头由卖方指向买方，最近 50 天。',
  'cartels': '卡特尔', 'shocks': '当前冲击', 'none': '无', 'members': '成员', 'floor': '最低价',
  'table.show': '表格', 'table.hide': '图表', 'connecting': '正在连接世界...', 'disconnected': '连接断开，正在重试...',
  'h.strategy': '{team}：“{text}”', 'h.tax': '政府将所得税设为 {pct}%', 'h.rate': '央行将基准利率设为 {pct}%',
  'h.ubi_on': '全民基本收入：每人每天 ${amount}', 'h.ubi_off': '全民基本收入取消',
  'h.antitrust_on': '监管机构向卡特尔宣战', 'h.antitrust_off': '监管机构撤退，卡特尔重新合法。',
  'h.print': '央行印钞 ${amount}：每位居民 ${each}',
  'h.shock.drought': '旱灾！收成崩溃 {ticks} 天', 'h.shock.mine_collapse': '矿难！矿石产量暴跌 {ticks} 天',
  'h.shock.tech_boom': '科技繁荣！工坊效率大增 {ticks} 天', 'h.shock.plague': '瘟疫肆虐 {ticks} 天',
  'h.shock.gold_rush': '淘金热！外国买家高价收购矿石 {ticks} 天', 'h.shock.trade_embargo': '禁运：{ticks} 天无进出口',
  'h.first_death': '首位死者：{team} 的 {name} 饿死了', 'h.bankrupt': '{team} 的 {name} 破产，欠款 ${debt}',
  'h.bank_crisis': '银行危机：贷款损失超出银行资本 ${loss}',
  'h.cartel_form': '{count} 名{good}生产者结成卡特尔（{teams}），最低价 ${floor}',
  'h.cartel_defect': '{team} 的 {name} 压价背叛{good}卡特尔，卡特尔瓦解。', 'h.cartel_collapse': '{good}卡特尔解散了',
  'h.cartel_antitrust': '监管机构拆散{good}卡特尔，并罚款 {count} 名成员',
  'h.price_spike': '{good}价格上涨 {pct}% 至 ${price}', 'h.price_crash': '{good}价格暴跌 {pct}% 至 ${price}',
  'h.starvation': '饥荒：10 天内 {count} 名居民饿死', 'h.richest': '{team} 的 {name}（{job}）成为首富：${wealth}',
  'h.monopoly': '{team} 现在控制 {pct}% 的{good}产量', 'h.baby_boom': '婴儿潮：20 天内出生 {count} 人',
  'h.hyperinflation': '恶性通胀：物价每年上涨 {pct}%', 'h.year': '第 {year} 年结束。GDP ${gdp}/天，人口 {pop}，通胀 {inflation}%',
  'h.custom': '{text}',
};

const ja: Dict = {
  'app.tagline': 'AI 文明アリーナ',
  'mode.live': 'ライブ', 'mode.replay': 'リプレイ', 'mode.paused': '一時停止', 'tick': '日', 'year': '年',
  'kpi.gdp': 'GDP / 日', 'kpi.inflation': 'インフレ率 / 年', 'kpi.unemployment': '失業率', 'kpi.gini': '格差 (ジニ)',
  'kpi.money': 'マネーサプライ', 'kpi.population': '人口',
  'panel.map': '世界', 'panel.leaderboard': '最強の資本家はどのモデル？', 'panel.economy': '経済',
  'panel.share': '総資産に占める割合', 'panel.prices': '価格', 'panel.network': 'チーム間の取引',
  'panel.feed': '最新の出来事', 'panel.controls': '経済を動かす',
  'chart.gdp': '1日あたり GDP', 'chart.cpi': '物価指数 (0日目 = 100)', 'chart.money': 'マネーサプライ', 'chart.unemployment': '失業率',
  'lb.score': 'スコア', 'lb.wealth': '資産', 'lb.gdp': 'GDP', 'lb.alive': '生存', 'lb.gini': 'ジニ', 'lb.bankrupt': '破産',
  'lb.offline': 'オフライン', 'lb.help': 'スコア = 30·資産シェア + 30·GDP シェア + 25·生存率 + 15·平等。',
  'feed.all': 'すべて', 'feed.drama': 'ドラマ', 'feed.empty': 'まだ静かです。',
  'ctl.play': '再生', 'ctl.pause': '一時停止', 'ctl.speed': '速度', 'ctl.tax': '所得税', 'ctl.rate': '政策金利',
  'ctl.ubi': 'ベーシックインカム / 日', 'ctl.welfare': '福祉', 'ctl.antitrust': '独禁法', 'ctl.print': 'お金を刷る',
  'ctl.shocks': 'ショック', 'ctl.reset': '新しい世界', 'ctl.readonly': 'リプレイは閲覧のみ。タイムラインで移動できます。',
  'ctl.live': 'ライブに戻る', 'ctl.download': 'リプレイを保存', 'ctl.open': 'リプレイを開く', 'ctl.drop': '.civ.json ファイルをドロップして再生',
  'shock.drought': '干ばつ', 'shock.mine_collapse': '落盤', 'shock.tech_boom': '技術ブーム', 'shock.plague': '疫病',
  'shock.gold_rush': 'ゴールドラッシュ', 'shock.trade_embargo': '禁輸',
  'good.food': '食料', 'good.wood': '木材', 'good.ore': '鉱石', 'good.tools': '道具', 'good.luxury': '贅沢品',
  'job.farmer': '農民', 'job.lumberjack': '木こり', 'job.miner': '鉱夫', 'job.smith': '鍛冶屋', 'job.artisan': '職人',
  'map.legend': '点 = 市民、色 = チーム、大きさ = 資産。輪 = カルテル参加者。',
  'map.hungry': '空腹', 'map.cartel': 'カルテル参加', 'map.loan': 'ローンあり', 'map.health': '健康',
  'net.world': '海外', 'net.help': '矢印は売り手から買い手へ。直近 50 日。',
  'cartels': 'カルテル', 'shocks': '発生中のショック', 'none': 'なし', 'members': '人', 'floor': '最低価格',
  'table.show': '表', 'table.hide': 'グラフ', 'connecting': '世界に接続中...', 'disconnected': '切断されました。再接続中...',
  'h.strategy': '{team}：「{text}」', 'h.tax': '政府が所得税を {pct}% に設定', 'h.rate': '中央銀行が政策金利を {pct}% に設定',
  'h.ubi_on': 'ベーシックインカム：1人1日 ${amount}', 'h.ubi_off': 'ベーシックインカムが廃止された',
  'h.antitrust_on': '規制当局がカルテルに宣戦布告', 'h.antitrust_off': '規制当局が撤退。カルテルが再び合法に。',
  'h.print': '中央銀行が ${amount} を印刷：市民1人あたり ${each}',
  'h.shock.drought': '干ばつ！ {ticks} 日間収穫が激減', 'h.shock.mine_collapse': '落盤！ {ticks} 日間鉱石の産出が激減',
  'h.shock.tech_boom': '技術ブーム！ {ticks} 日間工房の生産性が大幅アップ', 'h.shock.plague': '疫病が {ticks} 日間大流行',
  'h.shock.gold_rush': 'ゴールドラッシュ！ {ticks} 日間海外の買い手が鉱石を高値で購入', 'h.shock.trade_embargo': '禁輸：{ticks} 日間輸出入なし',
  'h.first_death': '最初の死者：{team} の {name} が餓死', 'h.bankrupt': '{team} の {name} が ${debt} の借金で破産',
  'h.bank_crisis': '銀行危機：貸倒損失が銀行の資本を ${loss} 上回った',
  'h.cartel_form': '{good}の生産者 {count} 人がカルテルを結成（{teams}）。最低価格 ${floor}',
  'h.cartel_defect': '{team} の {name} が{good}カルテルを裏切り、カルテルは崩壊。', 'h.cartel_collapse': '{good}カルテルが解散した',
  'h.cartel_antitrust': '規制当局が{good}カルテルを解体し、{count} 人に罰金',
  'h.price_spike': '{good}の価格が {pct}% 上昇し ${price} に', 'h.price_crash': '{good}の価格が {pct}% 暴落し ${price} に',
  'h.starvation': '飢饉：10 日間で {count} 人が餓死', 'h.richest': '{team} の {name}（{job}）が最も裕福な市民に：${wealth}',
  'h.monopoly': '{team} が{good}生産の {pct}% を支配', 'h.baby_boom': 'ベビーブーム：20 日間で {count} 人が誕生',
  'h.hyperinflation': 'ハイパーインフレ：物価が年 {pct}% 上昇', 'h.year': '{year} 年目が終了。GDP ${gdp}/日、人口 {pop}、インフレ {inflation}%',
  'h.custom': '{text}',
};

export const DICTS: Record<Lang, Dict> = { en, ru, es, de, zh, ja };

export function detectLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && q in DICTS) return q as Lang;
  try {
    const saved = localStorage.getItem('civarena.lang');
    if (saved && saved in DICTS) return saved as Lang;
  } catch { /* storage blocked */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return (nav in DICTS ? nav : 'en') as Lang;
}

export function makeT(lang: Lang) {
  const d = DICTS[lang];
  const t = (key: string, params?: Record<string, string | number>): string => {
    let s = d[key] ?? en[key] ?? key;
    if (params) {
      s = s.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = params[k];
        if (v === undefined) return '';
        if (k === 'good') return d[`good.${v}`] ?? String(v);
        if (k === 'job') return d[`job.${v}`] ?? String(v);
        if (typeof v === 'number') return fmtNum(v, lang);
        return String(v);
      });
    }
    return s;
  };
  return t;
}

export type T = ReturnType<typeof makeT>;

export function fmtNum(v: number, lang: Lang = 'en', digits?: number): string {
  const abs = Math.abs(v);
  const d = digits ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  return v.toLocaleString(lang === 'zh' ? 'zh-CN' : lang, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function fmtCompact(v: number, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : lang, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
