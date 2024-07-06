import { Project, ts, Node, SyntaxKind } from "ts-morph";

type TNode = Node<ts.Node>;

function traverseNode(node: TNode, cb: (node: TNode) => void) {
  cb(node);
  node.getChildren().forEach((node) => traverseNode(node, cb));
}

function findDeepestNode(
  root: TNode,
  where: (Node: TNode) => boolean,
): TNode | undefined {
  let current: TNode | undefined;

  traverseNode(root, (n) => {
    if (where(n)) {
      current = n;
    }
  });

  return current;
}

function isParentNonNull(node: TNode): boolean {
  return node.getParent()?.isKind(SyntaxKind.NonNullExpression) || false;
}

function appendBang(node: TNode): void {
  let nText = node.getText();
  const nHasSemi = nText.trim()[nText.trim().length - 1] === ";";

  if (nHasSemi) {
    nText = nText.substring(0, nText.length - 1) + "!" + ";";
  } else {
    nText += "!";
  }

  console.log("replacing", node.getText(), "->", nText);

  node.replaceWithText(nText);
}

// null assert priority
// 1. element access expression
// 2. return statement
// 3. identifier -> its value declaration
function fixDig<T extends TNode>(
  root: T,
  baseCond: (node: TNode) => boolean,
): void {
  const elemAccessNode = findDeepestNode(root, (n) => {
    if (!baseCond(n)) return false;
    if (n.isKind(SyntaxKind.ElementAccessExpression)) return true;
    return false;
  });

  if (elemAccessNode) {
    appendBang(elemAccessNode);
    return;
  }

  const retStatement = findDeepestNode(root, (n) => {
    if (!baseCond(n)) return false;
    if (n.isKind(SyntaxKind.ReturnStatement)) return true;
    return false;
  });

  if (retStatement) {
    appendBang(retStatement);
    return;
  }

  const identNode = findDeepestNode(root, (n) => {
    if (!baseCond(n)) return false;
    if (n.isKind(SyntaxKind.Identifier)) return true;
    return false;
  });

  if (identNode) {
    const valueDec = identNode.getSymbol()?.getValueDeclaration();
    if (!valueDec) {
      // should i call appendBang here?
      console.warn("no valueDec on", identNode.getText());
      return;
    }

    // bar: arr[0]
    if (valueDec.isKind(SyntaxKind.PropertyAssignment)) {
      const initializer = valueDec.getInitializer();
      if (!initializer) {
        console.warn("no initializer on", valueDec.getText());
        return;
      }

      fixDig(initializer, (n) => {
        if (isParentNonNull(n)) return false;
        return true;
      });

      return;
    }

    appendBang(valueDec);
    return;
  }
}

const project = new Project({
  tsConfigFilePath: process.argv[2] || "./tsconfig.json",
});

let diagnostics = project.getPreEmitDiagnostics();

for (let i = 0; i < diagnostics.length; i++) {
  const dig = diagnostics[i]!;

  // is possibly undefined code
  if (![2532, 18048, 2322].includes(dig.getCode())) continue;

  const start = dig.getStart();

  console.log(`fixing ${dig.getLineNumber()} ${start}`, dig.getMessageText());

  fixDig(
    dig.getSourceFile()!,
    (n) => n.getStart() === start && !isParentNonNull(n),
  );
  // we have to save the files and re run diagnostics as "start" would have changed by now
  project.saveSync();

  diagnostics = project.getPreEmitDiagnostics();
  i = 0;
}
