import re
import json
import os
import shutil

path = r"DT_Tatneft_model\kivz_1978.schema.json"
attributes = """Дата нанесения покрытия; Дата начала эксплуатации; Вид покрытия(Описание; код);; Способ нанесения(описание, код);; Схема или материал покрытия(Описание; код);; Предприятие наносившее покрытие; Координаты т/п в начале(кат. тип; номер);; Координаты т/п в конце(кат. тип; номер);;"""

#string = "БД Каталог , БД НАКОП , БД НАВОД , БД Трубопровод , БД Эксплуатация , БД OIRBAZA1 , БД OIRBAZA2 , БД OVPBAZA1 , БД OVPBAZA2 , БД OVPBAZA3 , OWPBAZA4 , БД OWPBAZA6 , БД OWPBAZA8 , БД ПАСПОРТ , БД PRISS , БД СОДОН"
#db_names = [s.strip() for s in string.split(',')]

FORM_TO_ADD = "ТН444 Ш80 ШО1"

def expand_attributes(attributes_text: str):
    expanded = []
    attributes_text = attributes_text.replace(";;", ";").replace("\n", "")
    pattern = re.compile(r'([^:]+):\((.*?)\)')
    while True:
        match = pattern.search(attributes_text)
        if not match:
            break
        prefix = match.group(1).strip()
        inside = match.group(2)
        inside_parts = [f"{prefix} {part.strip()}" for part in inside.split(';') if part.strip()]
        expanded.extend(inside_parts)
        attributes_text = attributes_text[:match.start()] + attributes_text[match.end():]
    for attr in attributes_text.split(';'):
        attr = attr.strip()
        if attr:
            expanded.append(attr)
    return expanded
attr = expand_attributes(attributes)
expanded = []
for elem in attr:
    parts = elem.split(';')
    for part in parts:
        part = part.strip()
        if part:
            expanded.append(part)
def norm(s: str) -> str:
    s = (s or "")
    s = re.sub(r'\s+', ' ', s)
    return s.strip().lower()

targets_norm = [norm(x) for x in expanded]

with open(path, encoding="utf-8") as f:
    schema = json.load(f)
updated_nodes = 0

def title_matches(title: str) -> bool:
    nt = norm(title)
    return any(t in nt for t in targets_norm)

def add_form_inplace(obj):
    global updated_nodes
    if isinstance(obj, dict):
        if "title" in obj and title_matches(obj["title"]):
            if "form" not in obj:
                obj["form"] = FORM_TO_ADD
            else:
                cur = obj["form"]
                if isinstance(cur, str):
                    # не дублируем
                    if FORM_TO_ADD not in norm(cur):
                        obj["form"] = cur + ", " + FORM_TO_ADD
                elif isinstance(cur, list):
                    if FORM_TO_ADD not in cur:
                        cur.append(FORM_TO_ADD)
                else:
                    obj["form"] = FORM_TO_ADD
            updated_nodes += 1
        for v in obj.values():
            add_form_inplace(v)

    elif isinstance(obj, list):
        for item in obj:
            add_form_inplace(item)

add_form_inplace(schema)
backup_path = path + ".bak"
try:
    shutil.copyfile(path, backup_path)
except Exception:
    pass

with open(path, "w", encoding="utf-8") as f:
    json.dump(schema, f, ensure_ascii=False, indent=2)

print(f"Готово: обновлено узлов = {updated_nodes}.")
print(f"Файл схемы перезаписан: {path}")
if os.path.exists(backup_path):
    print(f"Резервная копия: {backup_path}")
