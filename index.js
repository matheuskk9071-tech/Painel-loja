const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,

  // Permissões / Canais
  PermissionFlagsBits,
  ChannelType,

  // UI
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,

  // Modal
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// Ticket (opcional)
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID; // categoria tickets
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID; // cargo staff

// ================== CLIENT ==================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ================== DB PRODUTOS ==================
const db = new sqlite3.Database("./produtos.db");

// Obs: se você já tinha DB antiga sem coluna imagem/cargo_id, pode precisar recriar a DB.
// (ou deixar como está se já funcionava)
db.run(`
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  preco TEXT,
  estoque INTEGER,
  descricao TEXT,
  imagem TEXT,
  cargo_id TEXT
)
`);

// ================== TICKET CONFIG (EDITA AQUI) ==================
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
      "• Comprovante somente no botão 📎",
    color: 0x2b2d31,
    footer: "Sistema de Tickets • Premium",
  },

  pix: {
    chave: "SUA_CHAVE_PIX_AQUI", // <<<<< TROCA AQUI
    prazo: "até 30 minutos após confirmação",
  },

  categories: [
    {
      id: "compra",
      label: "🛒 Compra / Pagamento",
      description: "Comprar, pagar, enviar comprovante, prazo.",
      emoji: "🛒",
      channelPrefix: "compra",
      staffRoleIds: STAFF_ROLE_ID ? [STAFF_ROLE_ID] : [],
      form: {
        title: "Compra / Pagamento",
        fields: [
          { id: "produto", label: "Produto", style: "short", required: true, placeholder: "Ex: Dark Blade / Conta / Gamepass" },
          { id: "valor", label: "Valor (R$)", style: "short", required: true, placeholder: "Ex: 49,90" },
          { id: "detalhes", label: "Detalhes / Observações", style: "paragraph", required: false, placeholder: "Ex: urgência, horário, etc." },
        ],
      },
    },
    {
      id: "suporte",
      label: "🛠️ Suporte",
      description: "Problemas, dúvidas, ajuda geral.",
      emoji: "🛠️",
      channelPrefix: "suporte",
      staffRoleIds: STAFF_ROLE_ID ? [STAFF_ROLE_ID] : [],
      form: {
        title: "Suporte",
        fields: [
          { id: "assunto", label: "Assunto", style: "short", required: true, placeholder: "Ex: dúvida / erro / pedido" },
          { id: "descricao", label: "Descrição", style: "paragraph", required: true, placeholder: "Explique com detalhes" },
        ],
      },
    },
  ],
};

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
    description: (c.description || "Abrir ticket").slice(0, 100),
    emoji: c.emoji || undefined,
  }));

  return new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Selecione uma categoria…")
    .addOptions(options);
}

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

function buildProofModal() {
  const modal = new ModalBuilder()
    .setCustomId("modal_proof")
    .setTitle("Enviar comprovante");

  const link = new TextInputBuilder()
    .setCustomId("proof_link")
    .setLabel("Link/Texto do comprovante")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Ex: link da imagem / descrição do pagamento");

  modal.addComponents(new ActionRowBuilder().addComponents(link));
  return modal;
}

function buildTicketEmbed({ user, category, answers }) {
  const embed = new EmbedBuilder()
    .setTitle(`🎟️ Ticket aberto • ${category.label}`)
    .setColor(0x00d166)
    .setDescription(`Olá ${user}, seu ticket foi criado com sucesso.\n\n**Informações enviadas:**`)
    .setFooter({ text: "Mantenha tudo organizado para agilizar." })
    .setTimestamp();

  for (const a of answers) {
    const v = (a.value || "").toString().trim();
    if (v.length > 0) embed.addFields({ name: a.label, value: v.slice(0, 1024) });
  }

  if (category.id === "compra") {
    embed.addFields({
      name: "💳 Pagamento (Pix)",
      value:
        `• Chave Pix: \`${TICKET_CONFIG.pix.chave}\`\n` +
        `• Após pagar, clique em **📎 Enviar comprovante**\n` +
        `• Prazo: ${TICKET_CONFIG.pix.prazo}`,
    });
  }

  return embed;
}

// ================== REGISTER COMMANDS ==================
client.once("ready", async () => {
  console.log("Bot online!");

  const commands = [
    // PRODUTOS
    new SlashCommandBuilder()
      .setName("painel")
      .setDescription("Abrir painel da loja (admin)"),

    // TICKET PRO
    new SlashCommandBuilder()
      .setName("ticket-painel")
      .setDescription("Postar painel de tickets no canal (admin)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("ticket-setup")
      .setDescription("Ver variáveis necessárias do sistema de ticket (admin)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

  console.log("Comandos registrados!");
});

// ================== INTERACTIONS ==================
client.on("interactionCreate", async (interaction) => {
  try {
    // ================== SLASH COMMANDS ==================
    if (interaction.isChatInputCommand()) {
      // ---------- PRODUTOS: /painel ----------
      if (interaction.commandName === "painel") {
        if (!isAdmin(interaction.user.id))
          return interaction.reply({ content: "Sem permissão.", ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("prod_criar")
            .setLabel("➕ Criar produto")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("prod_catalogo")
            .setLabel("📦 Ver catálogo")
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: "Painel administrativo:",
          components: [row],
          ephemeral: true,
        });
      }

      // ---------- TICKET: /ticket-setup ----------
      if (interaction.commandName === "ticket-setup") {
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Setup Ticket (Premium)")
          .setColor(0x5865f2)
          .setDescription(
            "Variáveis no Railway (Variables):\n\n" +
              "✅ `TOKEN`\n✅ `CLIENT_ID`\n✅ `GUILD_ID`\n\n" +
              "Recomendado:\n" +
              "• `ADMIN_ID` (seu ID)\n" +
              "• `STAFF_ROLE_ID` (cargo staff)\n" +
              "• `TICKET_CATEGORY_ID` (categoria onde criar tickets)\n\n" +
              "Depois use **/ticket-painel** no canal para postar o painel."
          );

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ---------- TICKET: /ticket-painel ----------
      if (interaction.commandName === "ticket-painel") {
        if (!isAdmin(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "Sem permissão.", ephemeral: true });
        }

        const panelEmbed = buildPanelEmbed();
        const row = new ActionRowBuilder().addComponents(buildSelectMenu());

        await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
        return interaction.reply({ content: "Painel postado ✅", ephemeral: true });
      }
    }

    // ================== BUTTONS (PRODUTOS) ==================
    if (interaction.isButton()) {
      // ----- Criar produto (abre modal) -----
      if (interaction.customId === "prod_criar") {
        if (!isAdmin(interaction.user.id))
          return interaction.reply({ content: "Sem permissão.", ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId("modal_prod_criar")
          .setTitle("Criar Produto");

        const nome = new TextInputBuilder()
          .setCustomId("nome")
          .setLabel("Nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const preco = new TextInputBuilder()
          .setCustomId("preco")
          .setLabel("Preço")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const estoque = new TextInputBuilder()
          .setCustomId("estoque")
          .setLabel("Estoque")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descricao = new TextInputBuilder()
          .setCustomId("descricao")
          .setLabel("Descrição")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        const imagem = new TextInputBuilder()
          .setCustomId("imagem")
          .setLabel("URL da imagem (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nome),
          new ActionRowBuilder().addComponents(preco),
          new ActionRowBuilder().addComponents(estoque),
          new ActionRowBuilder().addComponents(descricao),
          new ActionRowBuilder().addComponents(imagem)
        );

        return interaction.showModal(modal);
      }

      // ----- Catálogo -----
      if (interaction.customId === "prod_catalogo") {
        db.all("SELECT * FROM produtos", [], (err, rows) => {
          if (err) return interaction.reply({ content: "Erro no banco.", ephemeral: true });

          if (!rows.length)
            return interaction.reply({ content: "Sem produtos.", ephemeral: true });

          const embed = new EmbedBuilder()
            .setTitle("📦 Catálogo")
            .setColor("Green");

          rows.forEach((p) => {
            embed.addFields({
              name: `${p.nome} | ${p.preco}`,
              value: `Estoque: ${p.estoque}\n${p.descricao || ""}`.slice(0, 1024),
            });
          });

          interaction.reply({ embeds: [embed], ephemeral: true });
        });
        return;
      }

      // ================== BUTTONS (TICKET) ==================
      if (interaction.customId === "ticket_send_proof") {
        return interaction.showModal(buildProofModal());
      }

      if (interaction.customId === "ticket_close") {
        const topic = interaction.channel.topic || "";
        const ownerId = (topic.match(/^ticket:(\d+):/) || [])[1];

        const isOwner = ownerId && interaction.user.id === ownerId;
        const isStaff =
          (STAFF_ROLE_ID && interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)) ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
          isAdmin(interaction.user.id);

        if (!isOwner && !isStaff) {
          return interaction.reply({ content: "Sem permissão pra fechar.", ephemeral: true });
        }

        if (ownerId) {
          await interaction.channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
        }

        await interaction.reply({ content: "Ticket fechado 🔒", ephemeral: true });

        return interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffcc00)
              .setTitle("🔒 Ticket fechado")
              .setDescription("Se precisar reabrir, clique no botão abaixo.")
              .setTimestamp(),
          ],
          components: [buildReopenButton()],
        });
      }

      if (interaction.customId === "ticket_reopen") {
        const topic = interaction.channel.topic || "";
        const ownerId = (topic.match(/^ticket:(\d+):/) || [])[1];

        const isStaff =
          (STAFF_ROLE_ID && interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)) ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
          isAdmin(interaction.user.id);

        if (!isStaff) return interaction.reply({ content: "Só a equipe pode reabrir.", ephemeral: true });

        if (ownerId) {
          await interaction.channel.permissionOverwrites.edit(ownerId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
          });
        }

        return interaction.reply({ content: "Ticket reaberto 🔓", ephemeral: true });
      }
    }

    // ================== SELECT MENU (TICKET) ==================
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      const categoryId = interaction.values[0];
      const category = TICKET_CONFIG.categories.find((c) => c.id === categoryId);
      if (!category) return interaction.reply({ content: "Categoria inválida.", ephemeral: true });

      const existing = await findExistingTicket(interaction.guild, interaction.user.id, categoryId);
      if (existing) {
        return interaction.reply({ content: `Você já tem um ticket aberto: ${existing}`, ephemeral: true });
      }

      return interaction.showModal(buildCategoryModal(category));
    }

    // ================== MODALS ==================
    if (interaction.isModalSubmit()) {
      // ----- Modal criar produto -----
      if (interaction.customId === "modal_prod_criar") {
        const nome = interaction.fields.getTextInputValue("nome");
        const preco = interaction.fields.getTextInputValue("preco");
        const estoque = interaction.fields.getTextInputValue("estoque");
        const descricao = interaction.fields.getTextInputValue("descricao");
        const imagem = interaction.fields.getTextInputValue("imagem") || null;

        db.run(
          `INSERT INTO produtos (nome, preco, estoque, descricao, imagem)
           VALUES (?, ?, ?, ?, ?)`,
          [nome, preco, estoque, descricao, imagem],
          function (err) {
            if (err) return interaction.reply({ content: "Erro ao criar produto.", ephemeral: true });
            return interaction.reply({ content: "✅ Produto criado!", ephemeral: true });
          }
        );
        return;
      }

      // ----- Modal abrir ticket -----
      if (interaction.customId.startsWith("modal_open_")) {
        const categoryId = interaction.customId.replace("modal_open_", "");
        const category = TICKET_CONFIG.categories.find((c) => c.id === categoryId);
        if (!category) return interaction.reply({ content: "Categoria inválida.", ephemeral: true });

        const answers = [];
        const fields = category.form?.fields || [];
        for (const f of fields.slice(0, 5)) {
          const value = interaction.fields.getTextInputValue(f.id);
          answers.push({ label: f.label, value });
        }

        const prefix = category.channelPrefix || "ticket";
        const channelName = safeChannelName(`${prefix}-${interaction.user.username}`);

        const overwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
        ];

        const staffRoles = category.staffRoleIds || [];
        for (const roleId of staffRoles) {
          overwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
            ],
          });
        }

        if (ADMIN_ID) {
          overwrites.push({
            id: ADMIN_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
            ],
          });
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID || null,
          topic: `ticket:${interaction.user.id}:${categoryId}`,
          permissionOverwrites: overwrites,
        });

        const ticketEmbed = buildTicketEmbed({
          user: interaction.user,
          category,
          answers,
        });

        await ticketChannel.send({
          content: `👋 ${interaction.user} ${staffRoles.length ? staffRoles.map((r) => `<@&${r}>`).join(" ") : ""}`,
          embeds: [ticketEmbed],
          components: [buildTicketButtons()],
        });

        return interaction.reply({ content: `Ticket criado ✅ ${ticketChannel}`, ephemeral: true });
      }

      // ----- Modal comprovante -----
      if (interaction.customId === "modal_proof") {
        const proof = interaction.fields.getTextInputValue("proof_link");

        const embed = new EmbedBuilder()
          .setColor(0x00d166)
          .setTitle("📎 Comprovante enviado")
          .setDescription(proof.slice(0, 4000))
          .setFooter({ text: `Enviado por ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ content: "Comprovante enviado ✅", ephemeral: true });
        return interaction.channel.send({ embeds: [embed] });
      }
    }
  } catch (e) {
    console.error(e);
    if (!interaction.replied) {
      try {
        await interaction.reply({ content: "Deu erro. Veja os logs do Railway.", ephemeral: true });
      } catch {}
    }
  }
});

client.login(TOKEN);
