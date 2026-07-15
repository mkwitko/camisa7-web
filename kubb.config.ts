import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";

export default defineConfig({
  root: ".",
  input: {
    path: "openapi.json",
  },
  output: {
    path: "./src/api/generated",
    clean: true,
  },
  plugins: [
    pluginOas(),

    pluginTs({
      output: { path: "./types" },
      dateType: "string",
      enumType: "asConst",
    }),

    pluginReactQuery({
      output: { path: "./hooks" },
      client: {
        importPath: "@/api/client",
        dataReturnType: "data",
      },
      query: {
        methods: ["get"],
        importPath: "@tanstack/react-query",
      },
      mutation: {
        methods: ["post", "put", "patch", "delete"],
      },
      group: {
        type: "tag",
        name: ({ group }) => `${group}Hooks`,
      },
    }),
  ],
});
