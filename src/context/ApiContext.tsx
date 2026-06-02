/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import axios from "axios";
import { useCookies } from "next-client-cookies";
import { createContext, useContext } from "react";
import { getTokenCookieName } from "@/lib/auth-cookies";

const baseURL = process.env.NEXT_PUBLIC_API_URL;

const LOGIN_PATH = "/login";

interface ApiContextProps {
  PostAPI: (
    url: string,
    data: unknown,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>;
  GetAPI: (
    url: string,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>;
  PutAPI: (
    url: string,
    data: unknown,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>;
  PatchAPI: (
    url: string,
    data: unknown,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>;
  DeleteAPI: (
    url: string,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>;
}

const ApiContext = createContext<ApiContextProps | undefined>(undefined);

interface ProviderProps {
  children: React.ReactNode;
}

export const ApiContextProvider = ({ children }: ProviderProps) => {
  const cookies = useCookies();
  const tokenCookieName = getTokenCookieName();

  const api = axios.create({
    baseURL,
  });

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const requestUrl: string = error.config?.url ?? "";
      // Não sequestrar o 401 da própria tela de login: deixe o formulário
      // exibir a mensagem de erro em vez de recarregar a página.
      const isSigninRequest = requestUrl.includes("/admin/auth/signin");
      if (
        error.response?.status === 401 &&
        !isSigninRequest &&
        typeof window !== "undefined" &&
        window.location.pathname !== LOGIN_PATH
      ) {
        cookies.remove(tokenCookieName);
        window.location.href = LOGIN_PATH;
      }
      return Promise.reject(error);
    },
  );

  function config(auth: boolean) {
    // Lê o token na hora da chamada (não no render do provider), para evitar
    // usar um valor desatualizado logo após o login.
    const currentToken = cookies.get(tokenCookieName);
    return {
      headers: {
        Authorization: auth ? `Bearer ${currentToken}` : "",
        "ngrok-skip-browser-warning": "any",
      },
    };
  }

  async function PostAPI(url: string, data: unknown, auth: boolean) {
    const connect = await api
      .post(url, data, config(auth))
      .then(({ data }) => {
        return {
          status: 200,
          body: data,
        };
      })
      .catch((err) => {
        // err.response é undefined em erro de rede (ex.: backend/túnel fora do ar).
        const status = err.response?.status ?? 0;
        const message =
          err.response?.data ?? "Não foi possível conectar ao servidor.";
        return { status, body: message };
      });

    return connect.status === 500
      ? {
          status: connect.status,
          body: "Ops! algo deu errado, tente novamente",
        }
      : connect;
  }

  async function GetAPI(url: string, auth: boolean) {
    const connect = await api
      .get(url, config(auth))
      .then(({ data }) => {
        return {
          status: 200,
          body: data,
        };
      })
      .catch((err) => {
        const message = err.response.data;
        const status = err.response.status;
        return { status, body: message };
      });

    return connect.status === 500
      ? {
          status: connect.status,
          body: "Ops! algo deu errado, tente novamente",
        }
      : connect;
  }

  async function PutAPI(url: string, data: unknown, auth: boolean) {
    const connect = await api
      .put(url, data, config(auth))
      .then(({ data }) => {
        return {
          status: 200,
          body: data,
        };
      })
      .catch((err) => {
        const message = err.response.data;
        const status = err.response.status;
        return { status, body: message };
      });

    return connect.status === 500
      ? {
          status: connect.status,
          body: "Ops! algo deu errado, tente novamente",
        }
      : connect;
  }

  async function PatchAPI(url: string, data: unknown, auth: boolean) {
    const connect = await api
      .patch(url, data, config(auth))
      .then(({ data }) => {
        return {
          status: 200,
          body: data,
        };
      })
      .catch((err) => {
        const message = err.response.data;
        const status = err.response.status;
        return { status, body: message };
      });

    return connect.status === 500
      ? {
          status: connect.status,
          body: "Ops! algo deu errado, tente novamente",
        }
      : connect;
  }

  async function DeleteAPI(url: string, auth: boolean) {
    const connect = await api
      .delete(url, config(auth))
      .then(({ data }) => {
        return {
          status: 200,
          body: data,
        };
      })
      .catch((err) => {
        const message = err.response.data;
        const status = err.response.status;
        return { status, body: message };
      });

    return connect.status === 500
      ? {
          status: connect.status,
          body: "Ops! algo deu errado, tente novamente",
        }
      : connect;
  }

  return (
    <ApiContext.Provider
      value={{
        PostAPI,
        GetAPI,
        PutAPI,
        PatchAPI,
        DeleteAPI,
      }}
    >
      {children}
    </ApiContext.Provider>
  );
};

export function useApiContext() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error(
      "useApiContext deve ser usado dentro de um ApiContextProvider",
    );
  }
  return context;
}
