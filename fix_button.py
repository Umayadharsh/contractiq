with open("frontend/src/App.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_button = False
for i, line in enumerate(lines):
    if "session.user.role !== 'Viewer' && (" in line and "button" in lines[i+1]:
        new_lines.append(line)
        new_lines.append('                    <button\n')
        new_lines.append('                      className="outline"\n')
        new_lines.append('                      disabled={evaluating || complianceReport != null}\n')
        new_lines.append('                      onClick={() => triggerComplianceEvaluation(selectedContract._id)}\n')
        new_lines.append('                    >\n')
        new_lines.append('                      {evaluating ? \'Evaluating...\' : selectedContract.status === \'Failed\' ? \'Evaluation Failed — Retry\' : \'Evaluate\'}\n')
        new_lines.append('                    </button>\n')
        in_button = True
    elif in_button:
        if "</button>" in line:
            in_button = False
    else:
        new_lines.append(line)

with open("frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
