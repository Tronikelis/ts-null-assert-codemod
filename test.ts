type OK4 = {
  nice: number;
};

type Factory = {
  each: (data: (data: string) => number) => number;
};

const factory: Factory = {
  each(data) {
    return data("");
  },
};

function ok4(): OK4 {
  const arr: number[] = [];

  const v = 0;

  const nice = arr[0];

  return {
    nice: nice!,
  };
}

function ok1(): number {
  let arr: number[] = [];
  return arr[0];
}

function ok3(): number {
  let arr: number[] = [];
  const anotha = arr[0]!;

  anotha.toString();

  return anotha;
}

function ok2(): string {
  let arr: string[] = [];

  let n: { foo: string } = {
    foo: "ok",
  };

  n = { foo: arr[0]! };

  return arr[0];
}

type Foo = {
  bar: number;
};

function ok() {
  let arr: number[][] = [];
  arr[0]![0]!.toString();

  const nice = arr[0]!;
  nice.toString();

  const foo: Foo = {
    bar: arr[0]![0]!,
  };

  const { foo1 } = { foo1: arr[0] };
  foo1!.toString();
}
