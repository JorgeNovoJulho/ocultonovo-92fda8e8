import { useTheme } from "@/hooks/useTheme";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme();

  return (
    <Sonner
      theme={resolved as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      richColors={false}
      // Padrão global: auto-fechamento em 5s. Erros podem subir para 7s
      // chamando `toast.error('...', { duration: 7000 })`.
      duration={5000}
      toastOptions={{
        closeButton: true,
        classNames: {
          // Amarelo de alta visibilidade + texto preto para contraste máximo.
          toast:
            "group toast !bg-yellow-400 !text-black !border-yellow-500 shadow-lg font-medium",
          title: "!text-black font-semibold",
          description: "!text-black/80",
          actionButton: "!bg-black !text-yellow-400",
          cancelButton: "!bg-black/10 !text-black",
          closeButton:
            "!bg-black !text-yellow-400 !border-black hover:!bg-black/80 !opacity-100 focus:!ring-2 focus:!ring-black/40 focus:!outline-none",
          icon: "!text-black",
          error: "!bg-yellow-400 !text-black !border-yellow-500",
          success: "!bg-yellow-400 !text-black !border-yellow-500",
          warning: "!bg-yellow-400 !text-black !border-yellow-500",
          info: "!bg-yellow-400 !text-black !border-yellow-500",
        },
      }}
      {...props}
    />
  );
};


export { Toaster, toast };
