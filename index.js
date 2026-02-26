const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ID = process.env.ADMIN_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const db = new sqlite3.Database("./produtos.db");

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

client.once("ready", async () => {
  console.log("Bot online");

  const commands = [
    new SlashCommandBuilder()
      .setName("painel")
      .setDescription("Abrir painel da loja")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
});

client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "painel") {

      if (interaction.user.id !== ADMIN_ID)
        return interaction.reply({ content: "Sem permissão.", ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("criar")
          .setLabel("➕ Criar produto")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("catalogo")
          .setLabel("📦 Ver catálogo")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "Painel administrativo:",
        components: [row],
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {

    if (interaction.customId === "criar") {

      const modal = new ModalBuilder()
        .setCustomId("modal_criar")
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
        .setStyle(TextInputStyle.Paragraph);

      const imagem = new TextInputBuilder()
        .setCustomId("imagem")
        .setLabel("URL da imagem")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nome),
        new ActionRowBuilder().addComponents(preco),
        new ActionRowBuilder().addComponents(estoque),
        new ActionRowBuilder().addComponents(descricao),
        new ActionRowBuilder().addComponents(imagem)
      );

      return interaction.showModal(modal);
    }

    if (interaction.customId === "catalogo") {
      db.all("SELECT * FROM produtos", [], (err, rows) => {

        if (!rows.length)
          return interaction.reply({ content: "Sem produtos.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle("📦 Catálogo")
          .setColor("Green");

        rows.forEach(p => {
          embed.addFields({
            name: `${p.nome} | ${p.preco}`,
            value: `Estoque: ${p.estoque}\n${p.descricao || ""}`
          });
        });

        interaction.reply({ embeds: [embed], ephemeral: true });
      });
    }
  }

  if (interaction.isModalSubmit()) {

    if (interaction.customId === "modal_criar") {

      const nome = interaction.fields.getTextInputValue("nome");
      const preco = interaction.fields.getTextInputValue("preco");
      const estoque = interaction.fields.getTextInputValue("estoque");
      const descricao = interaction.fields.getTextInputValue("descricao");
      const imagem = interaction.fields.getTextInputValue("imagem");

      db.run(
        `INSERT INTO produtos (nome, preco, estoque, descricao, imagem)
         VALUES (?, ?, ?, ?, ?)`,
        [nome, preco, estoque, descricao, imagem]
      );

      return interaction.reply({ content: "Produto criado!", ephemeral: true });
    }
  }
});

client.login(TOKEN);
