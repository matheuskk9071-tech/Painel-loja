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
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ID = process.env.ADMIN_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const db = new sqlite3.Database("./produtos.db");

db.run(`
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  preco TEXT,
  estoque INTEGER,
  descricao TEXT,
  imagem TEXT
)
`);

client.once("ready", async () => {
  console.log("Bot online!");

  const commands = [
    new SlashCommandBuilder()
      .setName("criar-produto")
      .setDescription("Criar e postar produto automaticamente")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
});

client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "criar-produto") {

      if (interaction.user.id !== ADMIN_ID)
        return interaction.reply({ content: "Sem permissão.", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId("modal_criar")
        .setTitle("Criar Produto");

      const nome = new TextInputBuilder()
        .setCustomId("nome")
        .setLabel("Nome do produto")
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
  }

  if (interaction.isModalSubmit()) {

    if (interaction.customId === "modal_criar") {

      const nome = interaction.fields.getTextInputValue("nome");
      const preco = interaction.fields.getTextInputValue("preco");
      const estoque = interaction.fields.getTextInputValue("estoque");
      const descricao = interaction.fields.getTextInputValue("descricao");
      const imagem = interaction.fields.getTextInputValue("imagem") || null;

      db.run(
        `INSERT INTO produtos (nome, preco, estoque, descricao, imagem)
         VALUES (?, ?, ?, ?, ?)`,
        [nome, preco, estoque, descricao, imagem],
        async function (err) {

          if (err)
            return interaction.reply({ content: "Erro ao criar produto.", ephemeral: true });

          const embed = new EmbedBuilder()
            .setTitle(nome)
            .setDescription(descricao || "Sem descrição")
            .addFields(
              { name: "💰 Preço", value: preco },
              { name: "📦 Estoque", value: estoque }
            )
            .setColor("Green");

          if (imagem) {
            embed.setImage(imagem);
          }

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`comprar_${this.lastID}`)
              .setLabel("💰 Comprar")
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.channel.send({
            embeds: [embed],
            components: [row]
          });

          interaction.reply({
            content: "Produto criado e postado no canal!",
            ephemeral: true
          });
        }
      );
    }
  }

  if (interaction.isButton()) {

    if (interaction.customId.startsWith("comprar_")) {

      const produtoId = interaction.customId.split("_")[1];

      db.get("SELECT * FROM produtos WHERE id = ?", [produtoId], async (err, produto) => {

        if (!produto)
          return interaction.reply({ content: "Produto não encontrado.", ephemeral: true });

        const ticket = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }
          ]
        });

        await ticket.send(`
🛒 **Compra iniciada**

Produto: ${produto.nome}
Valor: ${produto.preco}

💰 Chave Pix: 0a234107-6c22-4544-855b-f00e3c3c057f

Envie o comprovante aqui.
⏳ Prazo de entrega: até 30 minutos após confirmação.
        `);

        interaction.reply({
          content: "Ticket criado!",
          ephemeral: true
        });
      });
    }
  }

});

client.login(TOKEN);
