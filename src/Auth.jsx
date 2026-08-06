import { useState } from "react";
import { supabase } from "./supabase";

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setErrorMsg(error.message);
      } else if (data.user) {
        // Usa upsert para criar o perfil sem risco de erro por chave duplicada
        await supabase
          .from("profiles")
          .upsert([{ id: data.user.id, coins: 0, highscore: 0 }]);

        if (data.session) {
          onLogin(data.session.user);
        } else {
          alert("Conta criada com sucesso! Faça login para continuar.");
          setIsSignUp(false);
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Diagnóstico para aparecer no console do navegador (F12)
      console.log("Supabase Auth Response:", { data, error });

      if (error) {
        // Mostra o erro real que veio do Supabase na tela
        setErrorMsg(error.message);
      } else if (data.session) {
        onLogin(data.session.user);
      }
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#09090b",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "320px",
          textAlign: "center",
          padding: "20px",
        }}
      >
        <h2 style={{ color: "#facc15", marginBottom: "20px" }}>
          {isSignUp ? "Criar Conta" : "Entrar no Jogo"}
        </h2>

        {errorMsg && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "0.9rem",
              marginBottom: "10px",
            }}
          >
            {errorMsg}
          </p>
        )}

        <form
          onSubmit={handleAuth}
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#fff",
            }}
          />
          <input
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#fff",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px",
              borderRadius: "4px",
              border: "none",
              background: "#facc15",
              color: "#000",
              fontWeight: "bold",
              cursor: "pointer",
              marginTop: "5px",
            }}
          >
            {loading ? "Carregando..." : isSignUp ? "Cadastrar" : "Entrar"}
          </button>
        </form>

        <p
          onClick={() => setIsSignUp(!isSignUp)}
          style={{
            marginTop: "15px",
            color: "#a1a1aa",
            fontSize: "0.85rem",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {isSignUp
            ? "Já tem uma conta? Faça login"
            : "Não tem conta? Cadastre-se"}
        </p>
      </div>
    </div>
  );
}
