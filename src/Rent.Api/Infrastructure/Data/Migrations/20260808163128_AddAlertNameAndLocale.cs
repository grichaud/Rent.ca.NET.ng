using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Rent.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAlertNameAndLocale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Backfill existing rows with the default culture, not EF's scaffolded "".
            // The C# initializer (Alert.Locale = "en") only applies to newly constructed
            // objects in memory; it never reaches rows already in the table.
            migrationBuilder.AddColumn<string>(
                name: "Locale",
                table: "Alerts",
                type: "nvarchar(5)",
                maxLength: 5,
                nullable: false,
                defaultValue: "en");

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Alerts",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_IsActive_LastSentAt",
                table: "Alerts",
                columns: new[] { "IsActive", "LastSentAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Alerts_IsActive_LastSentAt",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "Locale",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "Alerts");
        }
    }
}
