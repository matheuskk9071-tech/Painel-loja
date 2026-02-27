const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Opcional, mas recomendado:
const ADMIN_ID = process.env.ADMIN_ID; // seu id
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID; // id da categoria onde os tickets serão criados (opcional)
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID; // cargo staff (opcional, mas recomendado)

// ================== CONFIG (EDITA AQUI) ==================
const TICKET_CONFIG = {
  panel: {
    title: "🎫 Central de Atendimento",
    description:
      "Selecione um setor abaixo para abrir seu ticket.\n\n" +
      "✅ Atendimento organizado\n" +
      "⏱️ Resposta mais rápida\n" +
      "🔒 Privado (somente você + equipe)\n\n" +
      "**Regras rápidas:**\n" +
      "• Não marque @everyone\n" +
      "• Envie detalhes completos\n" +
      "• Comprovante somente no botão (se necessário)",
    color: 0x2b2d31,
    footer: "Sistema de Tickets • Premium",
  },

  // CATEGORIAS (100% configurável)
  categories: [
    {
      id: "compra",
      label: "🛒 Compra / Pagamento",
      description: "Comprar, pagar, enviar comprovante, prazo.",
      emoji: "🛒",
      channelPrefix: "compra",
      staffRoleIds: (STAFF_ROLE_ID ? [STAFF_ROLE_ID] : []),
      form: {
        title: "Compra / Pagamento",
        fields: [
          { id: "produto", label: "O que você quer comprar?", style: "short", required: true, placeholder: "Ex: Dark Blade / 2x Money / Conta" },
          { id: "valor", label: "Valor (R$)", style: "short", required: true, placeholder: "Ex: 49,90" },
          { id: "detalhes", label: "Detalhes / Observações", style: "paragraph", required: false, placeholder: "Ex: Urgente / horário / etc" },
        ],
      },
    },
    {
      id: "suporte",
      label: "🛠️ Suporte",
      description: "Problemas, dúvidas, ajuda geral.",
      emoji: "🛠️",
      channelPrefix: "suporte",
      staffRoleIds: (STAFF_ROLE_ID ? [STAFF_ROLE_ID] : []),
      form: {
        title: "Suporte",
        fields: [
          { id: "assunto", label: "Assunto", style: "short", required: true, placeholder: "Ex: Não recebi / erro / dúvida" },
          { id: "descricao", label: "Descreva o problema", style: "paragraph", required: true, placeholder: "Explique com detalhes pra agilizar" },
        ],
      },
    },
    {
      id: "parceria",
      label: "🤝 Parceria",
      description: "Divulgação, parceria, collab.",
      emoji: "🤝",
      channelPrefix: "parceria",
      staffRoleIds: (STAFF_ROLE_ID ? [STAFF_ROLE_ID] : []),
      form: {
        title: "Parceria",
        fields: [
          { id: "rede", label: "Sua rede / canal", style: "short", required: true, placeholder: "Link do seu Discord / YouTube / TikTok" },
          { id: "proposta", label: "Proposta", style: "paragraph", required: true, placeholder: "Explique a parceria" },
        ],
      },
    },
  ],

  ticketMessage: {
    color: 0x00d166,
    paymentText:
      "**Pagamento (Pix):**\n" +
      "• Chave Pix: `SUA_CHAVE_PIX_AQUI`\n" +
      "• Após pagar, clique em **📎 Enviar comprovante**\n\n" +
      "**Prazo:** até X minutos após confirmação.",
  },
};

// ================== CLIENT ==================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ================== HELPERS ==================
function isAdmin(userId) {
  if (!ADMIN_ID) return true; // se não setar, não bloqueia
  return userId === ADMIN_ID;
}

function safeChannelName(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function findExistingTicket(guild, userId, categoryId) {
  // procura canal com topic ticket:userId:categoryId
  const topic = `ticket:${userId}:${categoryId}`;
  const channels = await guild.channels.fetch();
  return channels.find((c) => c && c.topic === topic);
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setTitle(TICKET_CONFIG.panel.title)
    .setDescription(TICKET_CONFIG.panel.description)
    .setColor(TICKET_CONFIG.panel.color)
    .setFooter({ text: TICKET_CONFIG.panel.footer });
}

function buildSelectMenu() {
  const options = TICKET_CONFIG.categories.map((c) => ({
    label: c.label,
    value: c.id,
    description: c.description?.slice(0, 100) || "Abrir ticket",
    emoji: c.emoji || undefined,
  }));

  return new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Selecione uma categoria…")
    .addOptions(options);
}

function buildTicketEmbed({ user, category, answers }) {
  const embed = new EmbedBuilder()
    .setTitle(`🎟️ Ticket aberto • ${category.label}`)
    .setColor(TICKET_CONFIG.ticketMessage.color)
    .setDescription(
      `Olá ${user}, seu ticket foi criado com sucesso.\n\n` +
      "**Informações enviadas:**"
    )
    .setFooter({ text: "Mantenha tudo organizado para agilizar." })
    .setTimestamp();

  // answers array: [{label, value}]
  for (const a of answers) {
    const v = (a.value || "").toString().trim();
    if (v.length > 0) embed.addFields({ name: a.label, value: v.slice(0, 1024) });
  }

  // bloco pagamento (só se categoria compra)
  if (category.id === "compra") {
    embed.addFields({ name: "💳 Pagamento", value: TICKET_CONFIG.ticketMessage.paymentText });
  }

  return embed;
}

function buildTicketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_send_proof")
      .setLabel("📎 Enviar comprovante")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Fechar")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildReopenButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_reopen")
      .setLabel("🔓 Reabrir")
      .setStyle(ButtonStyle.Success)
  );
}

// Modal de comprovante
function buildProofModal() {
  const modal = new ModalBuilder()
    .setCustomId("modal_proof")
    .setTitle("Enviar comprovante");

  const link = new TextInputBuilder()
    .setCustomId("proof_link")
    .setLabel("Link/Texto do comprovante (ou descreva)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Ex: link de imagem / código / descrição do pagamento");

  modal.addComponents(new ActionRowBuilder().addComponents(link));
  return modal;
}

// Modal da categoria (campos)
function buildCategoryModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_open_${category.id}`)
    .setTitle(category.form?.title || "Abrir Ticket");

  const rows = [];
  const fields = category.form?.fields || [];
  for (const f of fields.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setRequired(!!f.required)
      .setPlaceholder(f.placeholder || "")
      .setStyle(f.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short);

    rows.push(new ActionRowBuilder().addComponents(input));
  }

  modal.addComponents(...rows);
  return modal;
}

// ================== COMMANDS REGISTER ==================
client.once("ready", async () => {
  console.log("Bot online!");

  const commands = [
    new SlashCommandBuilder()
      .setName("ticket-painel")
      .setDescription("Posta o painel de tickets no canal")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("ticket-setup")
      .setDescription("Mostra quais variáveis você precisa configurar")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

  console.log("Comandos registrados!");
});

// ================== INTERACTIONS ==================
client.on("interactionCreate", async (interaction) => {
  try {
    // /ticket-setup
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-setup") {
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Setup do Ticket")
        .setColor(0x5865f2)
        .setDescription(
          "Configure as variáveis no Railway (Variables):\n\n" +
          "✅ `TOKEN`\n" +
          "✅ `CLIENT_ID`\n" +
          "✅ `GUILD_ID`\n\n" +
          "Recomendado:\n" +
          "• `ADMIN_ID` (seu ID)\n" +
          "• `STAFF_ROLE_ID` (cargo da equipe)\n" +
          "• `TICKET_CATEGORY_ID` (categoria onde criar tickets)\n\n" +
          "Depois use **/ticket-painel** no canal onde quer postar o painel."
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /ticket-painel
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-painel") {
      if (!isAdmin(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "Sem permissão.", ephemeral: true });
      }

      const panelEmbed = buildPanelEmbed();
      const row = new ActionRowBuilder().addComponents(buildSelectMenu());

      await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
      return interaction.reply({ content: "Painel postado ✅", ephemeral: true });
    }

    // Select: escolher categoria
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      const categoryId = interaction.values[0];
      const category = TICKET_CONFIG.categories.find((c) => c.id === categoryId);
      if (!category) return interaction.reply({ content: "Categoria inválida.", ephemeral: true });

      // bloquear duplicado
      const existing = await findExistingTicket(interaction.guild, interaction.user.id, categoryId);
      if (existing) {
        return interaction.reply({
          content: `Você já tem um ticket aberto: ${existing}`,
          ephemeral: true,
        });
      }

      // abrir modal para pegar infos
      const modal = buildCategoryModal(category);
      return interaction.showModal(modal);
    }

    // Modal submit: abrir ticket
    if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_open_")) {
      const category
