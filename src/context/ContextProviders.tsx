import { Toaster } from "react-hot-toast";
import { CookiesProvider } from "next-client-cookies/server";
import { ApiContextProvider } from "./ApiContext";
import { SampleContextProvider } from "./SampleContext";

export function ContextProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CookiesProvider>
        <ApiContextProvider>
          <SampleContextProvider>
            {children}
            <Toaster position="top-right" />
          </SampleContextProvider>
        </ApiContextProvider>
      </CookiesProvider>
    </>
  );
}
