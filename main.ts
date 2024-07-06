import { Project, ts, Node, SyntaxKind, PropertyAssignment } from "ts-morph";

const project = new Project({
  tsConfigFilePath: process.argv[2] || "./tsconfig.json",
});

let diagnostics = project.getPreEmitDiagnostics();

for (let i = 0; i < diagnostics.length; i++) {
  const dig = diagnostics[i]!;

  // is possibly undefined code
  if (![2532, 18048, 2322].includes(dig.getCode())) continue;

  const start = dig.getStart()!;

  console.log("start", start, "-", dig.getMessageText());

  const sourceFile = dig.getSourceFile()!;

  let foundNode: Node<ts.Node> | undefined;

  for (const child of sourceFile.getChildren()) {
    const findCb = (node: Node<ts.Node>): boolean => {
      if (node.getStart() !== start) return false;
      return isFixableNodeKind(node);
    };

    foundNode = findNodeWith(child, findCb);
    if (foundNode) break;
  }

  if (!foundNode) {
    throw new Error("did not find diagnostic node");
  }

  fixNode(foundNode);

  // save file and reset diagnostics as "start" would have changed by now
  sourceFile.saveSync();
  diagnostics = project.getPreEmitDiagnostics();
  i = 0;
}

function isFixableNodeKind(node: Node<ts.Node>): boolean {
  if (node.getParent()?.isKind(SyntaxKind.NonNullExpression)) return false;

  if (node.isKind(SyntaxKind.PropertyAssignment)) return true;

  if (node.isKind(SyntaxKind.ReturnStatement)) return true;

  if (node.isKind(SyntaxKind.ElementAccessExpression)) return true;

  if (
    node.isKind(SyntaxKind.Identifier) &&
    !node.getSymbol()?.getValueDeclaration()?.getType().isArray()
  ) {
    return true;
  }

  return false;
}

function fixNode(node: Node<ts.Node>) {
  if (node.getKind() === SyntaxKind.Identifier) {
    const valueDec = node.getSymbol()?.getValueDeclaration();
    if (!valueDec) {
      throw new Error(`no value declaration ${node.getText()}`);
    }

    appendBang(valueDec);
  } else if (node.getKind() === SyntaxKind.ElementAccessExpression) {
    appendBang(node);
  } else if (node.getKind() === SyntaxKind.ReturnStatement) {
    appendBang(node);
  } else if (node.getKind() === SyntaxKind.PropertyAssignment) {
    let initializer = (node as PropertyAssignment).getInitializer();

    if (initializer) {
      const node = findNodeWith(initializer, isFixableNodeKind);

      if (!node) return;
      fixNode(node);
      return;
    }
  }
}

function appendBang(node: Node<ts.Node>) {
  let hasSemi = node.getText().at(-1) === ";";

  let replaceWith = node.getText();
  if (hasSemi) {
    replaceWith = replaceWith.slice(0, replaceWith.length - 1) + "!;";
  } else {
    replaceWith += "!";
  }

  console.log(node.getText(), "->", replaceWith);

  node.replaceWithText(replaceWith);
}

function traverseNode(node: Node<ts.Node>, cb: (node: Node<ts.Node>) => void) {
  cb(node);
  node.getChildren().forEach((node) => {
    traverseNode(node, cb);
  });
}

function findNodeWith(
  node: Node<ts.Node>,
  cb: (node: Node<ts.Node>) => boolean,
): Node<ts.Node> | undefined {
  let found: Node<ts.Node> | undefined;

  traverseNode(node, (node) => {
    if (cb(node)) {
      found = node;
    }
  });

  return found;
}
