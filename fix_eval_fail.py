with open("frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

target = """    if (!response.ok) return setMessage(result.message || 'Compliance evaluation failed.')
    setMessage('Risk compliance evaluation complete.')
    loadContracts()
    loadPendingActions()"""

replacement = """    if (!response.ok) {
      setMessage(result.message || 'Compliance evaluation failed.')
      loadContracts()
      return
    }
    setMessage('Risk compliance evaluation complete.')
    loadContracts()
    loadPendingActions()"""

if target in text:
    text = text.replace(target, replacement)
    with open("frontend/src/App.jsx", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
