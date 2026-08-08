using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Rent.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPropertyDescriptionFr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DescriptionFr",
                table: "Properties",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DescriptionFr",
                table: "Properties");
        }
    }
}
