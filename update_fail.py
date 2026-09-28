with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ message: body?.detail || body?.message || 'Compliance evaluation failed' });"""

replacement = """    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        contract.status = 'Failed';
        await contract.save();
        return res.status(response.status).json({ message: body?.detail || body?.message || 'Compliance evaluation failed' });
    }"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
