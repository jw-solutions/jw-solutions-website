// Fixtures por lenguaje: código "sucio" que debe formatearse, ser idempotente y detectarse bien.
export const FIXTURES = [
  { lang: 'python', src: "import os\n\n\n\ndef foo(self, a: int, b=2):\n\tif a:\n\t\treturn a   \n\n\n\nclass K:\n    def bar(x):\n        pass\n", syntax: 'normalize' },
  { lang: 'javascript', src: "const x={a:1,b:[1,2,3]}\nfunction add(a,b){return a+b}\nconst f=async(a,b)=>{ await a; return b }\n", syntax: 'prettier' },
  { lang: 'typescript', src: "interface P{name:string;age:number}\nconst g=(p:P):string=>p.name\nexport function h(a:number,b?:string){return a}\n", syntax: 'prettier' },
  { lang: 'sql', src: "select a,b,count(*) from t join u on t.id=u.id where x=1 and y in (1,2) group by a,b order by a", syntax: 'sql' },
  { lang: 'json', src: '{"a":1,"b":[1,2,{"c":null}],"d":"x"}', syntax: 'json' },
  { lang: 'yaml', src: "a:   1\nb:\n    - x\n    - y\nc: {d: 1,  e: 2}\n", syntax: 'prettier' },
  { lang: 'java', src: "public class A {\n\tpublic static void main(String[] args) {\t\n\t\tSystem.out.println(\"hi\");  \n\t}\n}\n\n\n\n", syntax: 'normalize' },
  { lang: 'csharp', src: "using System;\nnamespace N {\n\tpublic class C {\n\t\tpublic static void Main() {\n\t\t\tConsole.WriteLine(\"hi\");   \n\t\t}\n\t}\n}\n", syntax: 'normalize' },
  { lang: 'php', src: "<?php\nfunction f($a){\n\treturn $a;   \n}\n\n\n\necho f(1);\n", syntax: 'normalize' },
  { lang: 'dax', src: "Total Sales =\n\tCALCULATE(SUM(Sales[Amount]),\n\t\tFILTER(Sales, Sales[Qty] > 0))   \n", syntax: 'normalize' },
];

// Entradas con sintaxis inválida: el formateador con parser debe rechazarlas (lanzar error).
export const INVALID = [
  { lang: 'json', src: '{"a":1,}' },
  { lang: 'javascript', src: 'function (' },
  { lang: 'yaml', src: 'a: [1, 2\nb: {' },
];
