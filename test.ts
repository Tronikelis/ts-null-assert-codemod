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

  return {
    nice: factory.each((ok) => Object.values(arr)[v]),
  };
}

function ok1(): number {
  let arr: number[] = [];
  return arr[0]!;
}

function ok3(): number {
  let arr: number[] = [];
  const anotha = arr[0]!;

  anotha.toString();

  return anotha;
}

function ok2(): string {
  let arr: string[] = [];
  return arr[0]!;
}

function ok() {
  let arr: number[][] = [];
  arr[0]![0]!.toString();

  const nice = arr[0]!;
  nice.toString();
}
