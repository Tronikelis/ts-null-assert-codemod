import { Project, ts, Node, SyntaxKind, DiagnosticCategory } from "ts-morph";
import * as path from "node:path";
import * as fs from "node:fs";

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
): boolean {
  const elemAccessNode = findDeepestNode(root, (n) => {
    if (!baseCond(n)) return false;
    if (n.isKind(SyntaxKind.ElementAccessExpression)) return true;
    return false;
  });

  if (elemAccessNode) {
    appendBang(elemAccessNode);
    return true;
  }

  const retStatement = findDeepestNode(root, (n) => {
    if (!baseCond(n)) return false;
    if (n.isKind(SyntaxKind.ReturnStatement)) return true;
    return false;
  });

  if (retStatement) {
    return false;
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
      return false;
    }

    // bar: arr[0] || jsx={foo}
    if (
      valueDec.isKind(SyntaxKind.PropertyAssignment) ||
      valueDec.isKind(SyntaxKind.JsxAttribute)
    ) {
      const initializer = valueDec.getInitializer();
      if (!initializer) {
        console.warn("no initializer on", valueDec.getText());
        return false;
      }

      return fixDig(initializer, (n) => {
        if (isParentNonNull(n)) return false;
        return true;
      });
    }

    // const {foo} = {foo}
    if (valueDec.isKind(SyntaxKind.BindingElement)) {
      appendBang(identNode);
      return true;
    }

    // fn parameter
    if (valueDec.isKind(SyntaxKind.Parameter)) {
      appendBang(identNode);
      return true;
    }

    appendBang(valueDec);
    return true;
  }

  return false;
}

function findRootPath(startPath: string, target: string): string | undefined {
  startPath = path.resolve(startPath);

  try {
    const test = path.join(startPath, target);
    fs.statSync(test);
    return test;
  } catch {}

  const parent = startPath.split(path.sep);
  parent.pop();

  startPath = parent.join(path.sep);
  if (!startPath) return;

  return findRootPath(startPath, target);
}

async function main() {
  const tsConfigFilePath = process.argv[2] || "./tsconfig.json";
  const libFolderPath = findRootPath(
    tsConfigFilePath,
    "./node_modules/typescript/lib",
  );

  console.log({ tsConfigFilePath, libFolderPath });

  const project = new Project({
    tsConfigFilePath,
    libFolderPath,
  });

  let diagnostics = project.getPreEmitDiagnostics();

  const skippedDigs = new Set<string>();

  for (let i = 0; i < diagnostics.length; i++) {
    const dig = diagnostics[i]!;

    const start = dig.getStart();

    const msgText = dig.getMessageText();
    const msg: string =
      typeof msgText === "string" ? msgText : msgText.getMessageText();

    const digHash = `${msg}${dig.getLineNumber()}${dig.getSourceFile()?.getFilePath()}`;

    if (!msg.includes("undefined") || skippedDigs.has(digHash)) continue;

    console.log(`fixing ${dig.getLineNumber()} ${start}`, msg);

    const success = fixDig(
      dig.getSourceFile()!,
      (n) => n.getStart() === start && !isParentNonNull(n),
    );

    if (!success) {
      console.log("can't fix, skipping", digHash);
      skippedDigs.add(digHash);
      continue;
    }

    // we have to save the files and re run diagnostics as "start" would have changed by now
    await project.save();

    diagnostics = project.getPreEmitDiagnostics();
    i = 0;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
