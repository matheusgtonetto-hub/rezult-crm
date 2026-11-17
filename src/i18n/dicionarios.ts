/**
 * Textos do produto em português, inglês e espanhol.
 *
 * Um arquivo só, com as três línguas lado a lado. Separadas em três arquivos, a
 * frase nova entraria numa e seria esquecida nas outras -- e o que aparece na
 * tela quando falta uma chave é a própria chave, um "login.entrar" cru.
 *
 * O tipo `Record<Chave, string>` nas traduções é o que impede isso: o português
 * é a fonte das chaves, e o TypeScript recusa compilar se o inglês ou o
 * espanhol deixarem alguma de fora. Não é escolha de estilo, é o único jeito de
 * a falta aparecer antes de chegar no usuário.
 *
 * Por enquanto cobre as telas de acesso. Cada tela nova traz suas chaves com o
 * prefixo dela, e a lista cresce sem mexer no que já existe.
 */

export const IDIOMAS = ["pt", "en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** Como cada idioma se chama no próprio idioma, para o seletor. */
export const NOME_DO_IDIOMA: Record<Idioma, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const pt = {
  // ── Login ──
  "login.titulo": "Entre na sua conta",
  "login.semConta": "Ainda não possui uma conta?",
  "login.email": "E-mail",
  "login.emailPlaceholder": "email@gmail.com",
  "login.senha": "Senha",
  "login.senhaPlaceholder": "Insira sua senha",
  "login.mostrarSenha": "Mostrar senha",
  "login.ocultarSenha": "Ocultar senha",
  "login.recuperarSenha": "Esqueci minha senha",
  "login.entrar": "Entrar",
  "login.aguarde": "Aguarde...",
  "login.criarConta": "Criar conta",
  "login.emailConfirmadoTitulo": "E-mail confirmado com sucesso!",
  "login.emailConfirmadoTexto": "Faça login para continuar.",
  "login.erroCamposVazios": "Preencha todos os campos.",
  "login.erroEmailNaoConfirmado": "Confirme seu e-mail antes de entrar.",
  "login.erroCredenciais": "E-mail ou senha incorretos.",

  // ── Recuperar senha ──
  "senha.titulo": "Recuperar senha",
  "senha.descricao": "Informe seu e-mail e enviaremos um link para redefinir sua senha.",
  "senha.enviar": "Enviar link de recuperação",
  "senha.enviando": "Enviando...",
  "senha.voltar": "Voltar para o login",
  "senha.enviadoTitulo": "E-mail enviado!",
  "senha.enviadoPara": "Enviamos um link de recuperação para",
  "senha.enviadoInstrucao": "Verifique sua caixa de entrada e clique no link para redefinir sua senha.",
  "senha.erroEmailVazio": "Informe seu e-mail.",
  "senha.erroEnvio": "Não foi possível enviar o link. Verifique o e-mail informado.",

  // ── Seletor de idioma ──
  // ── Cadastro ──
  "cadastro.titulo": "Crie a sua conta grátis",
  "cadastro.jaTemConta": "Já possui uma conta?",
  "cadastro.entreAqui": "Entre aqui",
  "cadastro.ou": "ou",
  "cadastro.recadastreSenha": "recadastre sua senha",
  "cadastro.nome": "Nome completo",
  "cadastro.nomePlaceholder": "Seu nome completo",
  "cadastro.confirmarSenha": "Confirmar senha",
  "cadastro.confirmarPlaceholder": "Repita sua senha",
  "cadastro.botao": "Continuar",
  "cadastro.criando": "Criando conta...",
  "cadastro.voltar": "Voltar para o login",
  "cadastro.erroNome": "Informe seu nome completo.",
  "cadastro.erroEmail": "Informe seu e-mail.",
  "cadastro.erroSenhaCurta": "A senha deve ter pelo menos 6 caracteres.",
  "cadastro.erroSenhasDiferentes": "As senhas não coincidem.",
  "cadastro.reenviamos": "Reenviamos o link de confirmação para o seu e-mail. Verifique sua caixa de entrada.",

  // ── Rodapé das telas de acesso ──
  "rodape.direitos": "Todos os direitos reservados.",
  "rodape.politica": "Política de privacidade",
  "rodape.termos": "Termos de uso",

  "cadastro.emailJaCadastrado": "Este e-mail já tem uma conta. Faça login ou recupere sua senha.",

  "idioma.rotulo": "Idioma",

  "tema.rotulo": "Tema",
  "tema.claro": "Tema claro",
  "tema.escuro": "Tema escuro",

  // ── Painel de destaques (lado direito do login e do cadastro) ──
  // Texto de venda: diz o que o Rezult faz. O que aparece DENTRO das cenas
  // animadas é réplica do produto em português, como um print, e por isso não
  // passa por este dicionário.
  "painel.rotulo": "Destaques do Rezult",
  "painel.anterior": "Destaque anterior",
  "painel.proximo": "Próximo destaque",
  "painel.pausar": "Pausar a apresentação",
  "painel.retomar": "Retomar a apresentação",
  "painel.irPara": "Ir para o destaque",
  "painel.funil.tag": "Funil de vendas",
  "painel.funil.titulo": "Todos os negócios num só funil",
  "painel.funil.descricao": "Arraste cada negócio de etapa em etapa e veja o que está perto de fechar.",
  "painel.atendimento.tag": "Atendimento",
  "painel.atendimento.titulo": "Seu time inteiro no mesmo WhatsApp",
  "painel.atendimento.descricao": "Várias pessoas respondem pelo mesmo número, e cada conversa fica ligada ao negócio.",
  "painel.automacoes.tag": "Automações",
  "painel.automacoes.titulo": "O follow-up acontece sozinho",
  "painel.automacoes.descricao": "Monte a sequência uma vez, com mensagem, espera e decisão, e ela roda sem ninguém precisar lembrar.",
  "painel.agentes.tag": "Agentes de IA",
  "painel.agentes.titulo": "Você briefa, o agente trabalha",
  "painel.agentes.descricao": "Defina o que cada agente faz, o tom que ele usa e até onde ele vai. Ele tira trabalho do seu time.",
} as const;

export type Chave = keyof typeof pt;

const en: Record<Chave, string> = {
  "login.titulo": "Sign in to your account",
  "login.semConta": "Don't have an account yet?",
  "login.email": "Email",
  "login.emailPlaceholder": "email@gmail.com",
  "login.senha": "Password",
  "login.senhaPlaceholder": "Enter your password",
  "login.mostrarSenha": "Show password",
  "login.ocultarSenha": "Hide password",
  "login.recuperarSenha": "Forgot password",
  "login.entrar": "Sign in",
  "login.aguarde": "Please wait...",
  "login.criarConta": "Create account",
  "login.emailConfirmadoTitulo": "Email confirmed successfully!",
  "login.emailConfirmadoTexto": "Sign in to continue.",
  "login.erroCamposVazios": "Fill in all fields.",
  "login.erroEmailNaoConfirmado": "Confirm your email before signing in.",
  "login.erroCredenciais": "Wrong email or password.",

  "senha.titulo": "Reset password",
  "senha.descricao": "Enter your email and we'll send you a link to reset your password.",
  "senha.enviar": "Send reset link",
  "senha.enviando": "Sending...",
  "senha.voltar": "Back to sign in",
  "senha.enviadoTitulo": "Email sent!",
  "senha.enviadoPara": "We sent a reset link to",
  "senha.enviadoInstrucao": "Check your inbox and click the link to reset your password.",
  "senha.erroEmailVazio": "Enter your email.",
  "senha.erroEnvio": "We couldn't send the link. Check the email you entered.",

  "cadastro.titulo": "Create your free account",
  "cadastro.jaTemConta": "Already have an account?",
  "cadastro.entreAqui": "Sign in here",
  "cadastro.ou": "or",
  "cadastro.recadastreSenha": "reset your password",
  "cadastro.nome": "Full name",
  "cadastro.nomePlaceholder": "Your full name",
  "cadastro.confirmarSenha": "Confirm password",
  "cadastro.confirmarPlaceholder": "Repeat your password",
  "cadastro.botao": "Continue",
  "cadastro.criando": "Creating account...",
  "cadastro.voltar": "Back to sign in",
  "cadastro.erroNome": "Enter your full name.",
  "cadastro.erroEmail": "Enter your email.",
  "cadastro.erroSenhaCurta": "Password must be at least 6 characters.",
  "cadastro.erroSenhasDiferentes": "Passwords don't match.",
  "cadastro.reenviamos": "We resent the confirmation link to your email. Check your inbox.",

  "rodape.direitos": "All rights reserved.",
  "rodape.politica": "Privacy policy",
  "rodape.termos": "Terms of use",

  "cadastro.emailJaCadastrado": "This email already has an account. Sign in or reset your password.",

  "idioma.rotulo": "Language",

  "tema.rotulo": "Theme",
  "tema.claro": "Light theme",
  "tema.escuro": "Dark theme",

  "painel.rotulo": "Rezult highlights",
  "painel.anterior": "Previous highlight",
  "painel.proximo": "Next highlight",
  "painel.pausar": "Pause the slideshow",
  "painel.retomar": "Resume the slideshow",
  "painel.irPara": "Go to highlight",
  "painel.funil.tag": "Sales pipeline",
  "painel.funil.titulo": "Every deal in one pipeline",
  "painel.funil.descricao": "Drag each deal from stage to stage and see what is close to closing.",
  "painel.atendimento.tag": "Customer service",
  "painel.atendimento.titulo": "Your whole team on one WhatsApp",
  "painel.atendimento.descricao": "Several people reply from the same number, and every conversation stays tied to its deal.",
  "painel.automacoes.tag": "Automations",
  "painel.automacoes.titulo": "Follow-ups run on their own",
  "painel.automacoes.descricao": "Build the sequence once, with message, wait and decision, and it runs without anyone having to remember.",
  "painel.agentes.tag": "AI agents",
  "painel.agentes.titulo": "You brief it, the agent works",
  "painel.agentes.descricao": "Define what each agent does, the tone it uses and how far it goes. It takes work off your team.",
};

const es: Record<Chave, string> = {
  "login.titulo": "Inicia sesión en tu cuenta",
  "login.semConta": "¿Aún no tienes una cuenta?",
  "login.email": "Correo electrónico",
  "login.emailPlaceholder": "email@gmail.com",
  "login.senha": "Contraseña",
  "login.senhaPlaceholder": "Ingresa tu contraseña",
  "login.mostrarSenha": "Mostrar contraseña",
  "login.ocultarSenha": "Ocultar contraseña",
  "login.recuperarSenha": "Olvidé mi contraseña",
  "login.entrar": "Entrar",
  "login.aguarde": "Espera...",
  "login.criarConta": "Crear cuenta",
  "login.emailConfirmadoTitulo": "¡Correo confirmado con éxito!",
  "login.emailConfirmadoTexto": "Inicia sesión para continuar.",
  "login.erroCamposVazios": "Completa todos los campos.",
  "login.erroEmailNaoConfirmado": "Confirma tu correo antes de entrar.",
  "login.erroCredenciais": "Correo o contraseña incorrectos.",

  "senha.titulo": "Recuperar contraseña",
  "senha.descricao": "Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.",
  "senha.enviar": "Enviar enlace de recuperación",
  "senha.enviando": "Enviando...",
  "senha.voltar": "Volver al inicio de sesión",
  "senha.enviadoTitulo": "¡Correo enviado!",
  "senha.enviadoPara": "Enviamos un enlace de recuperación a",
  "senha.enviadoInstrucao": "Revisa tu bandeja de entrada y haz clic en el enlace para restablecer tu contraseña.",
  "senha.erroEmailVazio": "Ingresa tu correo.",
  "senha.erroEnvio": "No pudimos enviar el enlace. Revisa el correo ingresado.",

  "cadastro.titulo": "Crea tu cuenta gratis",
  "cadastro.jaTemConta": "¿Ya tienes una cuenta?",
  "cadastro.entreAqui": "Entra aquí",
  "cadastro.ou": "o",
  "cadastro.recadastreSenha": "restablece tu contraseña",
  "cadastro.nome": "Nombre completo",
  "cadastro.nomePlaceholder": "Tu nombre completo",
  "cadastro.confirmarSenha": "Confirmar contraseña",
  "cadastro.confirmarPlaceholder": "Repite tu contraseña",
  "cadastro.botao": "Continuar",
  "cadastro.criando": "Creando cuenta...",
  "cadastro.voltar": "Volver al inicio de sesión",
  "cadastro.erroNome": "Ingresa tu nombre completo.",
  "cadastro.erroEmail": "Ingresa tu correo.",
  "cadastro.erroSenhaCurta": "La contraseña debe tener al menos 6 caracteres.",
  "cadastro.erroSenhasDiferentes": "Las contraseñas no coinciden.",
  "cadastro.reenviamos": "Reenviamos el enlace de confirmación a tu correo. Revisa tu bandeja de entrada.",

  "rodape.direitos": "Todos los derechos reservados.",
  "rodape.politica": "Política de privacidad",
  "rodape.termos": "Términos de uso",

  "cadastro.emailJaCadastrado": "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",

  "idioma.rotulo": "Idioma",

  "tema.rotulo": "Tema",
  "tema.claro": "Tema claro",
  "tema.escuro": "Tema oscuro",

  "painel.rotulo": "Destacados de Rezult",
  "painel.anterior": "Destacado anterior",
  "painel.proximo": "Siguiente destacado",
  "painel.pausar": "Pausar la presentación",
  "painel.retomar": "Reanudar la presentación",
  "painel.irPara": "Ir al destacado",
  "painel.funil.tag": "Embudo de ventas",
  "painel.funil.titulo": "Todos los negocios en un solo embudo",
  "painel.funil.descricao": "Arrastra cada negocio de etapa en etapa y mira lo que está cerca de cerrarse.",
  "painel.atendimento.tag": "Atención al cliente",
  "painel.atendimento.titulo": "Todo tu equipo en un mismo WhatsApp",
  "painel.atendimento.descricao": "Varias personas responden desde el mismo número y cada conversación queda ligada a su negocio.",
  "painel.automacoes.tag": "Automatizaciones",
  "painel.automacoes.titulo": "El seguimiento ocurre solo",
  "painel.automacoes.descricao": "Arma la secuencia una vez, con mensaje, espera y decisión, y se ejecuta sin que nadie tenga que acordarse.",
  "painel.agentes.tag": "Agentes de IA",
  "painel.agentes.titulo": "Tú das el brief, el agente trabaja",
  "painel.agentes.descricao": "Define qué hace cada agente, el tono que usa y hasta dónde llega. Le quita trabajo a tu equipo.",
};

export const DICIONARIOS: Record<Idioma, Record<Chave, string>> = { pt, en, es };
